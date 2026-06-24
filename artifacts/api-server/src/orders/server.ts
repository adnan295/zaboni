import { Server as SocketServer, Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db, usersTable, ordersTable } from "@workspace/db";
import { and, eq, isNotNull, ne, notInArray, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendPushToTokens, sendPushToUsers } from "../lib/push";
import { sendWebPushToRestaurant } from "../lib/webPush";
import type { AuthPayload } from "../middleware/auth";

const NEARBY_RADIUS_KM = 30;

interface RestaurantPortalSocketPayload {
  tokenType: "restaurant_portal";
  restaurantId: string;
  restaurantUserId: string;
  phone: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

const DAMASCUS_LAT = 33.5138;
const DAMASCUS_LON = 36.2765;

async function queryOrderStatus(orderId: string): Promise<string | null> {
  const rows = await db
    .select({ status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  return rows[0]?.status ?? null;
}

async function getSortedFreeCouriers(destLat: number, destLon: number): Promise<Array<{
  id: string;
  pushToken: string | null;
  fcmToken: string | null;
  apnToken: string | null;
  dist: number;
}>> {
  const [couriers, busyRows] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        pushToken: usersTable.pushToken,
        fcmToken: usersTable.fcmToken,
        apnToken: usersTable.apnToken,
        courierLat: usersTable.courierLat,
        courierLon: usersTable.courierLon,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "courier"),
          eq(usersTable.isOnline, true),
          or(
            isNotNull(usersTable.pushToken),
            isNotNull(usersTable.fcmToken),
            isNotNull(usersTable.apnToken),
          ),
        ),
      ),
    db
      .selectDistinct({ courierId: ordersTable.courierId })
      .from(ordersTable)
      .where(
        and(
          notInArray(ordersTable.status, ["delivered", "cancelled", "searching"]),
          ne(ordersTable.courierId, ""),
        ),
      ),
  ]);

  const busyIds = new Set(busyRows.map((r) => r.courierId));

  return couriers
    .filter((c) => !busyIds.has(c.id))
    .map((c) => ({
      id: c.id,
      pushToken: c.pushToken,
      fcmToken: c.fcmToken,
      apnToken: c.apnToken,
      dist: haversineKm(c.courierLat ?? DAMASCUS_LAT, c.courierLon ?? DAMASCUS_LON, destLat, destLon),
    }))
    .filter((c) => c.dist <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.dist - b.dist);
}

function extractTokens(couriers: Array<{ pushToken: string | null; fcmToken: string | null; apnToken: string | null }>) {
  const tokens = { expo: [] as string[], fcm: [] as string[], apns: [] as string[] };
  for (const c of couriers) {
    if (c.pushToken) tokens.expo.push(c.pushToken);
    if (c.fcmToken) tokens.fcm.push(c.fcmToken);
    if (c.apnToken) tokens.apns.push(c.apnToken);
  }
  return tokens;
}

export async function notifyNearbyCouriers(
  orderId: string,
  destLat: number,
  destLon: number,
  restaurantName: string,
  deliveryFee: number,
): Promise<void> {
  const title = "🛵 طلب جديد قريب منك!";
  const body = restaurantName
    ? `طلب من ${restaurantName} — رسوم التوصيل: ${deliveryFee.toLocaleString("ar-SY")} ل.س`
    : `طلب جديد — رسوم التوصيل: ${deliveryFee.toLocaleString("ar-SY")} ل.س`;
  const data = { type: "new_order" };

  const notifiedIds = new Set<string>();

  try {
    const sorted = await getSortedFreeCouriers(destLat, destLon);
    const phase1 = sorted.slice(0, 5);
    if (phase1.length > 0) {
      const tokens = extractTokens(phase1);
      const totals = await sendPushToTokens(tokens, title, body, data);
      for (const c of phase1) notifiedIds.add(c.id);
      logger.info({ count: phase1.length, orderId, totals }, "Tiered dispatch phase 1: notified closest couriers");
    } else {
      logger.info({ orderId }, "Tiered dispatch phase 1: no free nearby couriers");
    }
  } catch (err) {
    logger.warn({ err, orderId }, "Failed to notify nearby couriers phase 1");
  }

  setTimeout(() => {
    void (async () => {
      try {
        const status = await queryOrderStatus(orderId);
        if (status !== "searching") return;
        const sorted = await getSortedFreeCouriers(destLat, destLon);
        const phase2 = sorted.filter((c) => !notifiedIds.has(c.id)).slice(0, 10);
        if (phase2.length === 0) return;
        const tokens = extractTokens(phase2);
        const totals = await sendPushToTokens(tokens, title, body, data);
        for (const c of phase2) notifiedIds.add(c.id);
        logger.info({ count: phase2.length, orderId, totals }, "Tiered dispatch phase 2: expanded to more couriers");
      } catch (err) {
        logger.warn({ err, orderId }, "Failed to notify nearby couriers phase 2");
      }
    })();
  }, 90_000);

  setTimeout(() => {
    void (async () => {
      try {
        const status = await queryOrderStatus(orderId);
        if (status !== "searching") return;
        const sorted = await getSortedFreeCouriers(destLat, destLon);
        const phase3 = sorted.filter((c) => !notifiedIds.has(c.id));
        if (phase3.length === 0) return;
        const tokens = extractTokens(phase3);
        const totals = await sendPushToTokens(tokens, title, body, data);
        logger.info({ count: phase3.length, orderId, totals }, "Tiered dispatch phase 3: broadcast to all remaining couriers");
      } catch (err) {
        logger.warn({ err, orderId }, "Failed to notify nearby couriers phase 3");
      }
    })();
  }, 3 * 60_000);
}

export function notifyCouriersOrderTaken(orderId: string): void {
  if (!_ordersNs) return;
  _ordersNs.to("role:couriers").emit("order_taken", { orderId });
  logger.info({ orderId }, "Emitted order_taken to courier room");
}

export function setupOrdersNamespace(io: SocketServer): void {
  const ns = io.of("/orders");
  _ordersNs = ns;

  ns.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Authentication required"));

    // Allow admin panel connections via ADMIN_SECRET
    const adminSecret = process.env["ADMIN_SECRET"];
    if (adminSecret && token === adminSecret) {
      socket.isAdmin = true;
      return next();
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
