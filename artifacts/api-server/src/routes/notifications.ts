import { Router } from "express";
import { db, usersTable, notificationLogsTable } from "@workspace/db";
import { eq, isNotNull, desc, or, ilike } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { Expo } from "expo-server-sdk";
import { broadcastAppNotification } from "../orders/server";

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
  const tokens = [...new Set(
    users
      .map((u) => u.pushToken)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t))
  )];

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

  broadcastAppNotification(title, body, target);

  res.json({ success: true, sentCount, failedCount, total: tokens.length });
});

router.get("/admin/notifications/lookup-user", async (req, res) => {
  const q = String(req.query["q"] ?? "").trim();
  if (!q || q.length < 3) {
    res.status(400).json({ error: "ادخل 3 أحرف على الأقل للبحث" });
    return;
  }
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      role: usersTable.role,
      hasPushToken: isNotNull(usersTable.pushToken),
    })
    .from(usersTable)
    .where(or(ilike(usersTable.phone, `%${q}%`), ilike(usersTable.name, `%${q}%`)))
    .orderBy(desc(usersTable.createdAt))
    .limit(10);
  res.json(rows);
});

const sendToUserSchema = z.object({
  phone: z.string().min(7).max(20),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
});

router.post("/admin/notifications/send-to-user", async (req, res) => {
  const parsed = sendToUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { phone, title, body } = parsed.data;

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "لم يُعثر على مستخدم بهذا الرقم" });
    return;
  }

  if (!user.pushToken || !Expo.isExpoPushToken(user.pushToken)) {
    res.status(422).json({ error: "لا يمتلك هذا المستخدم رمز push نشط — لم يُرسَل الإشعار", userId: user.id, userName: user.name });
    return;
  }

  let sentCount = 0;
  let failedCount = 0;
  try {
    const [ticket] = await expo.sendPushNotificationsAsync([
      { to: user.pushToken, title, body, sound: "default" as const },
    ]);
    if (ticket?.status === "ok") sentCount = 1;
    else failedCount = 1;
  } catch {
    failedCount = 1;
  }

  const id = `notif_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(notificationLogsTable).values({
    id,
    title,
    body,
    target: "targeted",
    sentCount,
    failedCount,
  });

  res.json({ success: sentCount === 1, sentCount, failedCount, userId: user.id, userName: user.name });
});

router.get("/admin/notifications/history", async (_req, res) => {
  const rows = await db
    .select()
    .from(notificationLogsTable)
    .orderBy(desc(notificationLogsTable.createdAt))
    .limit(50);
  res.json(rows);
});

export default router;
