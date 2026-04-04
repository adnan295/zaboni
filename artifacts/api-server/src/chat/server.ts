import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket, Namespace } from "socket.io";
import { setupOrdersNamespace } from "../orders/server";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db, chatMessagesTable, usersTable, ordersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { Expo } from "expo-server-sdk";
import { logger } from "../lib/logger";
import type { AuthPayload } from "../middleware/auth";

function getJwtSecret(): string | null {
  const secret = process.env["JWT_SECRET"];
  if (!secret && process.env["NODE_ENV"] !== "production") {
    return "marsool-dev-secret-change-in-production-please";
  }
  return secret ?? null;
}

const expo = new Expo();

interface AuthenticatedSocket extends Socket {
  auth?: AuthPayload;
}

const connectedUsers = new Map<string, Set<string>>();

function trackUserConnection(userId: string, socketId: string) {
  const sockets = connectedUsers.get(userId) ?? new Set();
  sockets.add(socketId);
  connectedUsers.set(userId, sockets);
}

function untrackUserConnection(userId: string, socketId: string) {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) connectedUsers.delete(userId);
}

function isUserOnlineInRoom(
  ns: Namespace,
  userId: string,
  orderId: string
): boolean {
  const room = `order:${orderId}`;
  const sockets = connectedUsers.get(userId);
  if (!sockets || sockets.size === 0) return false;
  const roomSockets = ns.adapter.rooms.get(room);
  if (!roomSockets) return false;
  for (const sid of sockets) {
    if (roomSockets.has(sid)) return true;
  }
  return false;
}

export function createChatServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  const chatNamespace = io.of("/chat");

  chatNamespace.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const secret = getJwtSecret();
    if (!secret) {
      return next(new Error("JWT_SECRET not configured"));
    }

    try {
      const payload = jwt.verify(token, secret) as AuthPayload;
      socket.auth = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  chatNamespace.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.auth!.userId;
    trackUserConnection(userId, socket.id);
    logger.info({ userId, socketId: socket.id }, "Chat socket connected");

    socket.on("join", async ({ orderId }: { orderId: string }) => {
      if (!orderId) return;

      const orders = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);

      if (orders.length === 0) {
        socket.emit("error", { message: "Order not found" });
        return;
      }

      const order = orders[0];
      const isCustomer = order.userId === userId;
      const isCourier = order.courierId !== "" && order.courierId === userId;

      if (!isCustomer && !isCourier) {
        socket.emit("error", { message: "Forbidden" });
        return;
      }

      const senderRole = isCustomer ? "customer" : "courier";
      const room = `order:${orderId}`;
      socket.join(room);
      logger.info({ userId, orderId, senderRole }, "Socket joined chat room");

      const history = await db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.orderId, orderId))
        .orderBy(asc(chatMessagesTable.createdAt));

      socket.emit("history", history);
    });

    socket.on(
      "message",
      async ({ orderId, text }: { orderId: string; text: string }) => {
        if (!orderId || !text?.trim()) return;

        const orders = await db
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId))
          .limit(1);

        if (orders.length === 0) return;
        const order = orders[0];

        const isCustomer = order.userId === userId;
        const isCourier = order.courierId !== "" && order.courierId === userId;
        if (!isCustomer && !isCourier) return;

        const senderRole = (isCustomer ? "customer" : "courier") as
          | "customer"
          | "courier";
        const recipientId = isCustomer ? order.courierId : order.userId;

        const msg = {
          id: randomUUID(),
          orderId,
          senderId: userId,
          senderRole,
          text: text.trim(),
          createdAt: new Date(),
        };

        await db.insert(chatMessagesTable).values(msg);

        const room = `order:${orderId}`;
        chatNamespace.to(room).emit("message", msg);

        if (recipientId && !isUserOnlineInRoom(chatNamespace, recipientId, orderId)) {
          const senderName = socket.auth!.name || (isCustomer ? "عميل" : "مندوب");
          await sendPushNotification(
            recipientId,
            `${senderName}: ${text.trim()}`
          );
        }
      }
    );

    socket.on("typing", async ({ orderId }: { orderId: string }) => {
      if (!orderId) return;

      const orders = await db
        .select({ userId: ordersTable.userId, courierId: ordersTable.courierId })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);

      if (orders.length === 0) return;
      const order = orders[0];

      const isCustomer = order.userId === userId;
      const isCourier = order.courierId !== "" && order.courierId === userId;
      if (!isCustomer && !isCourier) return;

      const senderRole = isCustomer ? "customer" : "courier";
      const room = `order:${orderId}`;
      socket
        .to(room)
        .emit("typing", { senderId: userId, senderRole, orderId });
    });

    socket.on("stop-typing", async ({ orderId }: { orderId: string }) => {
      if (!orderId) return;

      const orders = await db
        .select({ userId: ordersTable.userId, courierId: ordersTable.courierId })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);

      if (orders.length === 0) return;
      const order = orders[0];

      const isCustomer = order.userId === userId;
      const isCourier = order.courierId !== "" && order.courierId === userId;
      if (!isCustomer && !isCourier) return;

      const senderRole = isCustomer ? "customer" : "courier";
      const room = `order:${orderId}`;
      socket
        .to(room)
        .emit("stop-typing", { senderId: userId, senderRole, orderId });
    });

    socket.on("disconnect", () => {
      untrackUserConnection(userId, socket.id);
      logger.info({ userId, socketId: socket.id }, "Chat socket disconnected");
    });
  });

  setupOrdersNamespace(io);

  return io;
}

async function sendPushNotification(userId: string, body: string) {
  try {
    const users = await db
      .select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const token = users[0]?.pushToken;
    if (!token || !Expo.isExpoPushToken(token)) return;

    await expo.sendPushNotificationsAsync([
      {
        to: token,
        sound: "default",
        title: "رسالة جديدة",
        body,
        data: { userId },
      },
    ]);
  } catch (err) {
    logger.warn({ err }, "Failed to send push notification");
  }
}
