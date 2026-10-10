import { canReceiveNewOrder, isWithinOrderRadius } from "../lib/courierDispatchPolicy";
import { Server as SocketServer, Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db, usersTable, ordersTable, restaurantsTable } from "@workspace/db";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendCourierPush, sendPushToUsers } from "../lib/push";
import { sendWebPushToRestaurant } from "../lib/webPush";
import type { AuthPayload } from "../middleware/auth";
import { verifyAdminToken } from "../middleware/adminAuth";

interface RestaurantPortalSocketPayload {
  tokenType: "restaurant_portal";
  restaurantId: string;
  restaurantUserId: string;
  phone: string;
}

function getJwtSecret(): string | null {
  return process.env["JWT_SECRET"] ?? null;
}

interface AuthenticatedSocket extends Socket {
  auth?: AuthPayload;
  restaurantAuth?: RestaurantPortalSocketPayload;
  isAdmin?: boolean;
}

let _ordersNs: Namespace | null = null;

export function notifyOrderUpdate(customerId: string, order: unknown): void {
  if (!_ordersNs) return;
  _ordersNs.to(`user:${customerId}`).emit("order_status_update", order);
  logger.debug({ customerId }, "Emitted order_status_update to customer");
}

export function notifyRestaurantNewOrder(restaurantId: string, order: unknown): void {
  if (!_ordersNs) return;
  _ordersNs.to(`restaurant:${restaurantId}`).emit("new_restaurant_order", order);
  logger.debug({ restaurantId }, "Emitted new_restaurant_order to restaurant room");
  const o = order as { orderText?: string } | null;
  void sendWebPushToRestaurant(restaurantId, {
    title: "🔔 طلب جديد!",
    body: o?.orderText ? o.orderText.slice(0, 80) : "وصل طلب جديد للمطعم",
  }).catch(() => {});
}

export function notifySupportMessage(userId: string, message: unknown): void {
  if (!_ordersNs) return;
  _ordersNs.to(`user:${userId}`).emit("support_message", message);
  logger.debug({ userId }, "Emitted support_message to customer");
}

export function notifyAdminSupportMessage(userId: string, message: unknown): void {
  if (!_ordersNs) return;
  _ordersNs.to("role:admins").emit("support_message_new", { userId, message });
  logger.debug({ userId }, "Emitted support_message_new to admins");
}

export function broadcastAppNotification(
  title: string,
  body: string,
  target: "all" | "customers" | "couriers",
): void {
  if (!_ordersNs) return;
  const payload = { title, body, type: "system" as const, target };
  if (target === "all") {
    _ordersNs.emit("app_notification", payload);
  } else {
    _ordersNs.to(`role:${target}`).emit("app_notification", payload);
  }
  logger.info({ title, target }, "Broadcast app_notification via socket");
}

export async function sendOrderPush(
  recipientId: string,
  body: string,
  orderId?: string,
): Promise<void> {
  try {
    const data: Record<string, string> = { type: "order_update", recipientId };
    if (orderId) data.orderId = orderId;

    const totals = await sendPushToUsers([recipientId], "زبوني", body, data);
    logger.debug({ recipientId, totals }, "Sent order push notification");
  } catch (err) {
    logger.warn({ err, recipientId }, "Failed to send order push notification");
  }
}

/** Called only by the durable dispatch worker. */
export async function notifyNearbyCouriers(
  orderId: string,
  restaurantId: string | null,
  restaurantName: string,
  deliveryFee: number,
  broaden = false,
): Promise<{ accepted: number; failed: number }> {
  const [order] = await db.select({ userId: ordersTable.userId, status: ordersTable.status })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order || order.status !== "searching") return { accepted: 0, failed: 0 };
  const restaurant = restaurantId ? (await db.select({ zoneId: restaurantsTable.zoneId,
    lat: restaurantsTable.lat, lon: restaurantsTable.lon }).from(restaurantsTable)
    .where(eq(restaurantsTable.id, restaurantId)).limit(1))[0] : undefined;
  const [couriers, active] = await Promise.all([
    db.select({ id: usersTable.id, zoneId: usersTable.zoneId,
      lat: usersTable.courierLat, lon: usersTable.courierLon,
      pushToken: usersTable.pushToken, fcmToken: usersTable.fcmToken, apnToken: usersTable.apnToken })
      .from(usersTable).where(and(eq(usersTable.role, "courier"), eq(usersTable.isOnline, true),
        eq(usersTable.isBlocked, false), ne(usersTable.id, order.userId))),
    db.select({ courierId: ordersTable.courierId, status: ordersTable.status }).from(ordersTable)
      .where(and(notInArray(ordersTable.status, ["delivered", "cancelled", "searching"]), ne(ordersTable.courierId, ""))),
  ]);
  const activeByCourier = new Map<string, string[]>();
  for (const row of active) activeByCourier.set(row.courierId, [...(activeByCourier.get(row.courierId) ?? []), row.status]);
  const eligible = couriers.filter(c => canReceiveNewOrder(activeByCourier.get(c.id) ?? []) &&
    isWithinOrderRadius(c.lat, c.lon, restaurant?.lat ?? null, restaurant?.lon ?? null));
  const inZone = restaurant?.zoneId ? eligible.filter(c => c.zoneId === restaurant.zoneId) : [];
  const selected = !broaden && inZone.length ? inZone : eligible;
  const title = "🛵 طلب جديد!";
  const body = restaurantName
    ? `طلب من ${restaurantName} — رسوم التوصيل: ${deliveryFee.toLocaleString("ar-SY")} ل.س`
    : `طلب جديد — رسوم التوصيل: ${deliveryFee.toLocaleString("ar-SY")} ل.س`;
  const data = { type: "new_order", orderId };
  // Socket is an additional foreground path, never a substitute for OS push.
  for (const courier of selected) _ordersNs?.to(`user:${courier.id}`).emit("new_order", data);
  const stillSearching = async () => {
    const [current] = await db.select({ status: ordersTable.status }).from(ordersTable)
      .where(eq(ordersTable.id, orderId)).limit(1);
    return current?.status === "searching";
  };
  let result = await sendCourierPush(selected, title, body, data, stillSearching);
  if (result.accepted === 0 && selected !== eligible) {
    const selectedIds = new Set(selected.map(c => c.id));
    const fallback = eligible.filter(c => !selectedIds.has(c.id));
    for (const courier of fallback) _ordersNs?.to(`user:${courier.id}`).emit("new_order", data);
    const expanded = await sendCourierPush(fallback, title, body, data, stillSearching);
    result = { accepted: result.accepted + expanded.accepted, failed: result.failed + expanded.failed };
  }
  logger.info({ orderId, eligible: eligible.length, broaden, ...result }, "Courier dispatch submission (not device delivery)");
  return result;
}

export function notifyCouriersOrderTaken(orderId: string): void {
  if (!_ordersNs) return;
  _ordersNs.to("role:couriers").emit("order_taken", { orderId });
  logger.info({ orderId }, "Emitted order_taken to courier room");
}

export function setupOrdersNamespace(io: SocketServer): void {
  const ns = io.of("/orders");
  _ordersNs = ns;

  ns.use(async (socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Authentication required"));

    // Allow admin panel connections via the admin password (DB-stored or the
    // bootstrap ADMIN_SECRET).
    try {
      if (await verifyAdminToken(token)) {
        socket.isAdmin = true;
        return next();
      }
    } catch {
      return next(new Error("Authentication error"));
    }

    const secret = getJwtSecret();
    if (!secret) return next(new Error("JWT_SECRET not configured"));

    try {
      const decoded = jwt.verify(token, secret) as AuthPayload | RestaurantPortalSocketPayload;
      if ((decoded as RestaurantPortalSocketPayload).tokenType === "restaurant_portal") {
        socket.restaurantAuth = decoded as RestaurantPortalSocketPayload;
      } else {
        socket.auth = decoded as AuthPayload;
      }
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  ns.on("connection", async (socket: AuthenticatedSocket) => {
    if (socket.isAdmin) {
      socket.join("role:admins");
      logger.info({ socketId: socket.id }, "Admin socket connected to /orders");
      socket.on("disconnect", () => {
        logger.info({ socketId: socket.id }, "Admin socket disconnected from /orders");
      });
      return;
    }

    if (socket.restaurantAuth) {
      const { restaurantId, restaurantUserId } = socket.restaurantAuth;
      socket.join(`restaurant:${restaurantId}`);
      logger.info({ restaurantId, restaurantUserId, socketId: socket.id }, "Restaurant portal socket connected");
      socket.on("disconnect", () => {
        logger.info({ restaurantId, socketId: socket.id }, "Restaurant portal socket disconnected");
      });
      return;
    }

    const userId = socket.auth!.userId;
    socket.join(`user:${userId}`);

    try {
      const rows = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const role = rows[0]?.role;
      if (role === "customer") socket.join("role:customers");
      else if (role === "courier") socket.join("role:couriers");
    } catch {
    }

    logger.info({ userId, socketId: socket.id }, "Orders socket connected");

    socket.on("disconnect", () => {
      logger.info({ userId, socketId: socket.id }, "Orders socket disconnected");
    });
  });

  logger.info("Orders WebSocket namespace /orders ready");
}
