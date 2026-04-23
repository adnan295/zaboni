import { Router } from "express";
import { db, usersTable, notificationLogsTable } from "@workspace/db";
import { eq, desc, or, ilike } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { broadcastAppNotification } from "../orders/server";
import { requireAuth } from "../middleware/auth";
import { sendPushToRole, sendPushToUsers, totalsSentCount, totalsFailedCount } from "../lib/push";

const router = Router();

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

  const totals = await sendPushToRole(target, title, body);
  const sentCount = totalsSentCount(totals);
  const failedCount = totalsFailedCount(totals);

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

  res.json({ success: true, sentCount, failedCount, totals });
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
      pushToken: usersTable.pushToken,
      fcmToken: usersTable.fcmToken,
      apnToken: usersTable.apnToken,
    })
    .from(usersTable)
    .where(or(ilike(usersTable.phone, `%${q}%`), ilike(usersTable.name, `%${q}%`)))
    .orderBy(desc(usersTable.createdAt))
    .limit(10);
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      role: r.role,
      hasPushToken: !!(r.pushToken || r.fcmToken || r.apnToken),
    })),
  );
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
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      pushToken: usersTable.pushToken,
      fcmToken: usersTable.fcmToken,
      apnToken: usersTable.apnToken,
    })
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "لم يُعثر على مستخدم بهذا الرقم" });
    return;
  }

  if (!user.pushToken && !user.fcmToken && !user.apnToken) {
    const failId = `notif_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    await db.insert(notificationLogsTable).values({
      id: failId,
      title,
      body,
      target: "targeted",
      sentCount: 0,
      failedCount: 1,
    });
    res.status(422).json({
      error: "لا يمتلك هذا المستخدم رمز push نشط — لم يُرسَل الإشعار",
      userId: user.id,
      userName: user.name,
    });
    return;
  }

  const totals = await sendPushToUsers([user.id], title, body);
  const sentCount = totalsSentCount(totals);
  const failedCount = totalsFailedCount(totals);

  const id = `notif_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(notificationLogsTable).values({
    id,
    title,
    body,
    target: "targeted",
    sentCount,
    failedCount,
  });

  res.json({
    success: sentCount > 0,
    sentCount,
    failedCount,
    totals,
    userId: user.id,
    userName: user.name,
  });
});

router.get("/admin/notifications/history", async (_req, res) => {
  const rows = await db
    .select()
    .from(notificationLogsTable)
    .orderBy(desc(notificationLogsTable.createdAt))
    .limit(50);
  res.json(rows);
});

const pushTokenSchema = z.object({
  token: z.string().min(1),
});

router.post("/push-token", requireAuth, async (req, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload — token (string) required" });
    return;
  }
  const userId = req.auth!.userId;
  await db
    .update(usersTable)
    .set({ pushToken: parsed.data.token })
    .where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

const deviceTokensSchema = z
  .object({
    fcmToken: z.string().min(1).max(512).nullable().optional(),
    apnToken: z.string().min(1).max(256).nullable().optional(),
  })
  .refine((v) => v.fcmToken !== undefined || v.apnToken !== undefined, {
    message: "Provide fcmToken and/or apnToken",
  });

router.put("/auth/device-tokens", requireAuth, async (req, res) => {
  const parsed = deviceTokensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.auth!.userId;
  const updates: { fcmToken?: string | null; apnToken?: string | null } = {};
  if (parsed.data.fcmToken !== undefined) updates.fcmToken = parsed.data.fcmToken || null;
  if (parsed.data.apnToken !== undefined) updates.apnToken = parsed.data.apnToken || null;

  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

export default router;
