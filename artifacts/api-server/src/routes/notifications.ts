import { Router } from "express";
import { db, usersTable, notificationLogsTable, userNotificationsTable } from "@workspace/db";
import { eq, desc, or, ilike, inArray, sql, and } from "drizzle-orm";
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
router.use("/admin/churn", requireAdmin);

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
      id: failId, title, body, target: "targeted", sentCount: 0, failedCount: 1,
    });
    await db.insert(userNotificationsTable).values({
      id: `un_${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id, title, body, type: "system",
    });
    res.status(422).json({
      error: "لا يمتلك هذا المستخدم رمز push نشط — لم يُرسَل الإشعار",
      userId: user.id, userName: user.name,
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

router.get("/notifications", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  const [personal, broadcast] = await Promise.all([
    db
      .select({
        id: userNotificationsTable.id,
        title: userNotificationsTable.title,
        body: userNotificationsTable.body,
        type: userNotificationsTable.type,
        orderId: userNotificationsTable.orderId,
        isRead: userNotificationsTable.isRead,
        createdAt: userNotificationsTable.createdAt,
      })
      .from(userNotificationsTable)
      .where(eq(userNotificationsTable.userId, userId))
      .orderBy(desc(userNotificationsTable.createdAt))
      .limit(50),
    db
      .select({
        id: notificationLogsTable.id,
        title: notificationLogsTable.title,
        body: notificationLogsTable.body,
        createdAt: notificationLogsTable.createdAt,
      })
      .from(notificationLogsTable)
      .where(inArray(notificationLogsTable.target, ["all", "customers"]))
      .orderBy(desc(notificationLogsTable.createdAt))
      .limit(20),
  ]);

  const broadcastMapped = broadcast.map((n) => ({
    id: `bcast_${n.id}`,
    title: n.title,
    body: n.body,
    type: "promo" as const,
    orderId: null,
    isRead: false,
    createdAt: n.createdAt,
  }));

  const combined = [...personal, ...broadcastMapped].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ).slice(0, 60);

  res.json(combined);
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const id = String(req.params["id"]);
  if (id.startsWith("bcast_")) { res.json({ ok: true }); return; }
  await db
    .update(userNotificationsTable)
    .set({ isRead: true })
    .where(and(eq(userNotificationsTable.id, id), eq(userNotificationsTable.userId, userId)));
  res.json({ ok: true });
});

router.delete("/notifications/:id", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const id = String(req.params["id"]);
  if (id.startsWith("bcast_")) { res.json({ ok: true }); return; }
  await db
    .delete(userNotificationsTable)
    .where(and(eq(userNotificationsTable.id, id), eq(userNotificationsTable.userId, userId)));
  res.json({ ok: true });
});

const churnSchema = z.object({
  inactiveDays: z.coerce.number().int().min(1).max(365).default(7),
});

router.get("/admin/churn", async (req, res) => {
  const parsed = churnSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { inactiveDays } = parsed.data;

  const rows = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      u.phone,
      MAX(o.created_at)           AS "lastOrderAt",
      COUNT(o.id)::int            AS "totalOrders",
      (u.push_token IS NOT NULL OR u.fcm_token IS NOT NULL OR u.apn_token IS NOT NULL) AS "hasPushToken"
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.role = 'customer'
    GROUP BY u.id, u.name, u.phone, u.push_token, u.fcm_token, u.apn_token
    HAVING
      MAX(o.created_at) < NOW() - CAST(${inactiveDays} || ' days' AS INTERVAL)
      OR MAX(o.created_at) IS NULL
    ORDER BY MAX(o.created_at) ASC NULLS FIRST
  `);

  res.json(
    (rows.rows as Record<string, unknown>[]).map((r) => ({
      id: r["id"],
      name: r["name"] ?? null,
      phone: r["phone"],
      lastOrderAt: r["lastOrderAt"] ?? null,
      totalOrders: Number(r["totalOrders"] ?? 0),
      hasPushToken: Boolean(r["hasPushToken"]),
    })),
  );
});

const bulkUsersSchema = z.object({
  userIds: z.array(z.string()).min(1).max(500),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  promoCode: z.string().optional(),
});

router.post("/admin/notifications/bulk-users", async (req, res) => {
  const parsed = bulkUsersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { userIds, title, body, promoCode } = parsed.data;

  const data: Record<string, string> = { type: "churn_reactivation" };
  if (promoCode) data["promoCode"] = promoCode;

  const totals = await sendPushToUsers(userIds, title, body, data);
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

  res.json({ success: true, sentCount, failedCount, totals });
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
