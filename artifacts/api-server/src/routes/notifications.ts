import { Router } from "express";
import { db, usersTable, notificationLogsTable } from "@workspace/db";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { Expo } from "expo-server-sdk";

const router = Router();
const expo = new Expo();

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: "Admin panel is not configured." });
    return;
  }
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
  if (!token || token !== ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/admin/notifications", requireAdmin);

const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  target: z.enum(["all", "customers", "couriers"]).default("all"),
});

router.post("/admin/notifications/broadcast", async (req, res) => {
  const parsed = broadcastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { title, body, target } = parsed.data;

  let usersQuery = db
    .select({ id: usersTable.id, pushToken: usersTable.pushToken, role: usersTable.role })
    .from(usersTable)
    .where(isNotNull(usersTable.pushToken))
    .$dynamic();

  if (target === "customers") {
    usersQuery = usersQuery.where(eq(usersTable.role, "customer"));
  } else if (target === "couriers") {
    usersQuery = usersQuery.where(eq(usersTable.role, "courier"));
  }

  const users = await usersQuery;
  const tokens = users
    .map((u) => u.pushToken)
    .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

  const CHUNK_SIZE = 100;
  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((token) => ({
      to: token,
      title,
      body,
      sound: "default" as const,
    }));
    try {
      const tickets = await expo.sendPushNotificationsAsync(messages);
      for (const ticket of tickets) {
        if (ticket.status === "ok") sentCount++;
        else failedCount++;
      }
    } catch {
      failedCount += chunk.length;
    }
  }

  const id = `notif_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(notificationLogsTable).values({
    id,
    title,
    body,
    target,
    sentCount,
    failedCount,
  });

  res.json({ success: true, sentCount, failedCount, total: tokens.length });
});

router.get("/admin/notifications/history", async (_req, res) => {
  const rows = await db
    .select()
    .from(notificationLogsTable)
    .orderBy(notificationLogsTable.createdAt)
    .limit(20);
  res.json(rows.reverse());
});

export default router;
