import { Server as SocketServer, Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Expo } from "expo-server-sdk";
import { logger } from "../lib/logger";
import type { AuthPayload } from "../middleware/auth";

const DEV_JWT_SECRET = "marsool-dev-secret-change-in-production-please";

function getJwtSecret(): string | null {
  const secret = process.env["JWT_SECRET"];
  if (!secret && process.env["NODE_ENV"] !== "production") return DEV_JWT_SECRET;
  return secret ?? null;
}

interface AuthenticatedSocket extends Socket {
  auth?: AuthPayload;
}

let _ordersNs: Namespace | null = null;
const expo = new Expo();

export function notifyOrderUpdate(customerId: string, order: unknown): void {
  if (!_ordersNs) return;
  _ordersNs.to(`user:${customerId}`).emit("order_updated", order);
  _ordersNs.to(`user:${customerId}`).emit("order_status_update", order);
  logger.debug({ customerId }, "Emitted order_updated + order_status_update to customer");
}

export async function sendOrderPush(
  recipientId: string,
  body: string
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
        title: "مرسول",
        body,
        data: { recipientId },
      },
    ]);
  } catch (err) {
    logger.warn({ err, recipientId }, "Failed to send order push notification");
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

  ns.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.auth!.userId;
    socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, "Orders socket connected");

    socket.on("disconnect", () => {
      logger.info({ userId, socketId: socket.id }, "Orders socket disconnected");
    });
  });

  logger.info("Orders WebSocket namespace /orders ready");
}
