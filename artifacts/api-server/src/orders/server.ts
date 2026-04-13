import { Server as SocketServer, Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { Expo } from "expo-server-sdk";
import { logger } from "../lib/logger";
import type { AuthPayload } from "../middleware/auth";

const NEARBY_RADIUS_KM = 30;

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
}

let _ordersNs: Namespace | null = null;
const expo = new Expo();

export function notifyOrderUpdate(customerId: string, order: unknown): void {
  if (!_ordersNs) return;
  _ordersNs.to(`user:${customerId}`).emit("order_status_update", order);
  logger.debug({ customerId }, "Emitted order_status_update to customer");
}

export function broadcastAppNotification(
  title: string,
  body: string,
  target: "all" | "customers" | "couriers"
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
  orderId?: string
): Promise<void> {
  try {
    const users = await db
      .select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, recipientId))
      .limit(1);

    const token = users[0]?.pushToken;
    if (!token || !Expo.isExpoPushToken(token)) return;

    await expo.sendPushNotificationsAsync([
      {
        to: token,
        sound: "default",
        title: "زبوني",
        body,
        data: { type: "order_update", recipientId, ...(orderId ? { orderId } : {}) },
      },
    ]);
  } catch (err) {
    logger.warn({ err, recipientId }, "Failed to send order push notification");
  }
}

export async function notifyNearbyCouriers(
  destLat: number,
  destLon: number,
  restaurantName: string,
  deliveryFee: number,
): Promise<void> {
  try {
    const couriers = await db
      .select({
        id: usersTable.id,
        pushToken: usersTable.pushToken,
        courierLat: usersTable.courierLat,
        courierLon: usersTable.courierLon,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "courier"),
          eq(usersTable.isOnline, true),
          isNotNull(usersTable.pushToken),
        ),
      );

    const DAMASCUS_LAT = 33.5138;
    const DAMASCUS_LON = 36.2765;

    const messages: Parameters<typeof expo.sendPushNotificationsAsync>[0] = [];

    for (const courier of couriers) {
      const lat = courier.courierLat ?? DAMASCUS_LAT;
      const lon = courier.courierLon ?? DAMASCUS_LON;
      const dist = haversineKm(lat, lon, destLat, destLon);
      if (dist > NEARBY_RADIUS_KM) continue;
      const token = courier.pushToken;
      if (!token || !Expo.isExpoPushToken(token)) continue;

      messages.push({
        to: token,
        sound: "default",
        title: "🛵 طلب جديد قريب منك!",
        body: restaurantName
          ? `طلب من ${restaurantName} — رسوم التوصيل: ${deliveryFee.toLocaleString("ar-SY")} ل.س`
          : `طلب جديد — رسوم التوصيل: ${deliveryFee.toLocaleString("ar-SY")} ل.س`,
        data: { type: "new_order" },
      });
    }

    if (messages.length > 0) {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.info({ count: messages.length }, "Sent new-order push to nearby couriers");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to notify nearby couriers");
  }
}

export function setupOrdersNamespace(io: SocketServer): void {
  const ns = io.of("/orders");
  _ordersNs = ns;

  ns.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Authentication required"));

    const secret = getJwtSecret();
    if (!secret) return next(new Error("JWT_SECRET not configured"));

    try {
      const payload = jwt.verify(token, secret) as AuthPayload;
      socket.auth = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  ns.on("connection", async (socket: AuthenticatedSocket) => {
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
