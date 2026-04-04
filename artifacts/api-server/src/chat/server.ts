import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db, chatMessagesTable, usersTable, ordersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { Expo } from "expo-server-sdk";
import { logger } from "../lib/logger";
import type { AuthPayload } from "../middleware/auth";

const DEV_JWT_SECRET = "marsool-dev-secret-change-in-production-please";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret && process.env["NODE_ENV"] !== "production") return DEV_JWT_SECRET;
  return secret ?? DEV_JWT_SECRET;
}

const expo = new Expo();

const COURIER_AUTO_REPLIES = [
  "إن شاء الله 🙏",
  "تمام يا باشا",
  "وصلت قريب",
  "عندك 5 دقايق",
  "أنا في الطريق",
  "ما في مشكلة",
];

const COURIER_ID = "courier-sim-001";

interface AuthenticatedSocket extends Socket {
  auth?: AuthPayload;
}

export function createChatServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
      socket.auth = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.auth!.userId;
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
      if (order.userId !== userId) {
        socket.emit("error", { message: "Forbidden" });
        return;
      }

      const room = `order:${orderId}`;
      socket.join(room);
      logger.info({ userId, orderId, room }, "Socket joined chat room");

      const history = await db
        .select()
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.orderId, orderId))
        .orderBy(asc(chatMessagesTable.createdAt));

      socket.emit("history", history);

      if (history.length === 0) {
        await saveCourierMessage(io, orderId, "أهلاً، استلمت طلبك وأنا في الطريق 🛵");
      }
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

        if (orders.length === 0 || orders[0].userId !== userId) return;

        const msg = {
          id: randomUUID(),
          orderId,
          senderId: userId,
          senderRole: "customer" as const,
          text: text.trim(),
          createdAt: new Date(),
        };

        await db.insert(chatMessagesTable).values(msg);

        const room = `order:${orderId}`;
        io.to(room).emit("message", msg);

        const delay = Math.floor(Math.random() * 2000) + 2000;
        setTimeout(async () => {
          const reply =
            COURIER_AUTO_REPLIES[
              Math.floor(Math.random() * COURIER_AUTO_REPLIES.length)
            ];

          const room = `order:${orderId}`;
          io.to(room).emit("typing", { senderId: COURIER_ID, senderRole: "courier", orderId });

          await new Promise((r) => setTimeout(r, 1200));
          io.to(room).emit("stop-typing", { senderId: COURIER_ID, orderId });

          await saveCourierMessage(io, orderId, reply);

          await sendPushNotification(orders[0].userId, `المندوب: ${reply}`);
        }, delay);
      }
    );

    socket.on("typing", ({ orderId }: { orderId: string }) => {
      if (!orderId) return;
      const room = `order:${orderId}`;
      socket.to(room).emit("typing", { senderId: userId, senderRole: "customer", orderId });
    });

    socket.on("stop-typing", ({ orderId }: { orderId: string }) => {
      if (!orderId) return;
      const room = `order:${orderId}`;
      socket.to(room).emit("stop-typing", { senderId: userId, senderRole: "customer", orderId });
    });

    socket.on("disconnect", () => {
      logger.info({ userId, socketId: socket.id }, "Chat socket disconnected");
    });
  });

  return io;
}

async function saveCourierMessage(
  io: SocketServer,
  orderId: string,
  text: string
) {
  const msg = {
    id: randomUUID(),
    orderId,
    senderId: COURIER_ID,
    senderRole: "courier" as const,
    text,
    createdAt: new Date(),
  };
  await db.insert(chatMessagesTable).values(msg);
  const room = `order:${orderId}`;
  io.to(room).emit("message", msg);
  return msg;
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
