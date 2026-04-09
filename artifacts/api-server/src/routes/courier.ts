import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, ordersTable, orderStatusHistoryTable, orderRatingsTable, courierSubscriptionsTable, systemSettingsTable, courierCustomerRatingsTable, courierWalletTransactionsTable } from "@workspace/db";
import { and, eq, ne, avg, count, sql, desc } from "drizzle-orm";
import { haversineKm as _haversineKm } from "../lib/deliveryZones";
import { z } from "zod";
import { notifyOrderUpdate, sendOrderPush } from "../orders/server";

const router: IRouter = Router();

function resolveUserId(req: Request): string {
  return req.auth!.userId;
}

async function requireCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = resolveUserId(req);
  const users = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!users[0] || users[0].role !== "courier") {
    res.status(403).json({ error: "Only couriers can access this endpoint" });
    return;
  }
  next();
}

router.get("/courier/stats", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const [deliveredRow, ratingRow, userRow] = await Promise.all([
    db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.courierId, courierId), eq(ordersTable.status, "delivered"))),
    db
      .select({ avgRating: avg(orderRatingsTable.courierStars) })
      .from(orderRatingsTable)
      .where(eq(orderRatingsTable.courierId, courierId)),
    db
      .select({ name: usersTable.name, phone: usersTable.phone, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, courierId))
      .limit(1),
  ]);

  res.json({
    deliveredCount: deliveredRow[0]?.count ?? 0,
    avgRating: ratingRow[0]?.avgRating ? Number(Number(ratingRow[0].avgRating).toFixed(1)) : null,
    name: userRow[0]?.name ?? "",
    phone: userRow[0]?.phone ?? "",
    role: userRow[0]?.role ?? "courier",
  });
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return _haversineKm(lat1, lon1, lat2, lon2);
}

router.post("/courier/register", async (req, res) => {
  const userId = resolveUserId(req);

  const rows = await db
    .update(usersTable)
    .set({ role: "courier" })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name, role: usersTable.role });

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(rows[0]);
});

const availabilitySchema = z.object({
  isOnline: z.boolean(),
});

router.patch("/courier/availability", requireCourier, async (req, res) => {
  const body = availabilitySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid payload — isOnline (boolean) required" });
    return;
  }

  const courierId = resolveUserId(req);
  await db
    .update(usersTable)
    .set({ isOnline: body.data.isOnline })
    .where(eq(usersTable.id, courierId));

  res.json({ ok: true, isOnline: body.data.isOnline });
});

router.get("/courier/me", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const users = await db
    .select({ isOnline: usersTable.isOnline })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

  res.json({ isOnline: users[0]?.isOnline ?? true });
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

router.patch("/courier/location", requireCourier, async (req, res) => {
  const body = locationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid location payload — lat and lon required" });
    return;
  }

  const courierId = resolveUserId(req);
  await db
    .update(usersTable)
    .set({ courierLat: body.data.lat, courierLon: body.data.lon })
    .where(eq(usersTable.id, courierId));

  res.json({ ok: true });
});

const NEARBY_RADIUS_KM = 30;
const DAMASCUS_LAT = 33.5138;
const DAMASCUS_LON = 36.2765;

router.get("/courier/orders/available", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const courierUser = await db
    .select({ lat: usersTable.courierLat, lon: usersTable.courierLon, isOnline: usersTable.isOnline })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

  if (!courierUser[0]?.isOnline) {
    res.json([]);
    return;
  }

  const courierLat = courierUser[0]?.lat ?? DAMASCUS_LAT;
  const courierLon = courierUser[0]?.lon ?? DAMASCUS_LON;

  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.status, "searching"), eq(ordersTable.courierId, "")))
    .orderBy(ordersTable.createdAt);

  const withDistance = rows
    .filter((o) => o.userId !== courierId)
    .map((o) => {
      const destLat = o.destinationLat ?? DAMASCUS_LAT;
      const destLon = o.destinationLon ?? DAMASCUS_LON;
      return {
        ...o,
        distanceKm: Number(haversineKm(courierLat, courierLon, destLat, destLon).toFixed(1)),
      };
    })
    .filter((o) => o.distanceKm <= NEARBY_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(withDistance);
});

router.get("/courier/orders/active", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.courierId, courierId))
    .orderBy(ordersTable.updatedAt);

  res.json(rows.filter((o) => o.status !== "delivered" && o.status !== "searching"));
});

router.post("/courier/orders/:orderId/accept", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const order = orders[0];

  if (order.status !== "searching" || order.courierId !== "") {
    res.status(409).json({ error: "Order is no longer available" });
    return;
  }

  if (order.userId === courierId) {
    res.status(400).json({ error: "Cannot accept your own order" });
    return;
  }

  const existingActive = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.courierId, courierId), ne(ordersTable.status, "delivered")))
    .limit(1);

  if (existingActive.length > 0) {
    res.status(409).json({ error: "You already have an active order. Complete it first." });
    return;
  }

  const courierUsers = await db
    .select({ name: usersTable.name, phone: usersTable.phone, isOnline: usersTable.isOnline })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

  if (!courierUsers[0]?.isOnline) {
    res.status(409).json({ error: "You must be online to accept orders" });
    return;
  }

  const courierName = courierUsers[0]?.name || "مندوب";
  const courierPhone = courierUsers[0]?.phone || "";

  const updated = await db
    .update(ordersTable)
    .set({ courierId, courierName, courierPhone, courierRating: 5.0, status: "accepted", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, ""), eq(ordersTable.status, "searching")))
    .returning();

  if (updated.length === 0) {
    res.status(409).json({ error: "Order was already accepted by another courier" });
    return;
  }

  await db.insert(orderStatusHistoryTable).values({
    id: `${orderId}_accepted_${Date.now()}`,
    orderId,
    status: "accepted",
  });

  notifyOrderUpdate(order.userId, updated[0]);
  await sendOrderPush(order.userId, `${courierName} قبل طلبك وهو في الطريق لاستلامه!`);

  res.json(updated[0]);
});

const courierStatusSchema = z.object({
  status: z.enum(["picked_up", "on_way", "delivered"]),
});

const STATUS_PUSH_MESSAGES: Record<string, string> = {
  picked_up: "المندوب استلم طلبك من المطعم 📦",
  on_way: "المندوب في الطريق إليك الآن 🛵",
  delivered: "تم التوصيل بنجاح 🎉 بالعافية!",
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  accepted: ["picked_up"],
  picked_up: ["on_way"],
  on_way: ["delivered"],
};

router.patch("/courier/orders/:orderId/status", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const body = courierStatusSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid status — must be picked_up, on_way, or delivered" });
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, courierId)))
    .limit(1);

  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found or not your order" });
    return;
  }

  const currentOrder = orders[0];
  const allowedNext = STATUS_TRANSITIONS[currentOrder.status] ?? [];
  if (!allowedNext.includes(body.data.status)) {
    res.status(409).json({
      error: `Cannot transition from ${currentOrder.status} to ${body.data.status}`,
    });
    return;
  }

  const updated = await db
    .update(ordersTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, courierId)))
    .returning();

  if (updated.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  await db.insert(orderStatusHistoryTable).values({
    id: `${orderId}_${body.data.status}_${Date.now()}`,
    orderId,
    status: body.data.status,
  });

  notifyOrderUpdate(currentOrder.userId, updated[0]);

  const pushMsg = STATUS_PUSH_MESSAGES[body.data.status] ?? "تم تحديث طلبك";
  await sendOrderPush(currentOrder.userId, pushMsg);

  res.json(updated[0]);
});

router.post("/courier/orders/:orderId/cancel", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, courierId)))
    .limit(1);

  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found or not your order" });
    return;
  }

  const order = orders[0];

  if (order.status === "delivered") {
    res.status(409).json({ error: "Cannot cancel a delivered order" });
    return;
  }

  const updated = await db
    .update(ordersTable)
    .set({
      courierId: "",
      courierName: "",
      courierPhone: "",
      courierRating: 0,
      status: "searching",
      updatedAt: new Date(),
    })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, courierId)))
    .returning();

  if (updated.length === 0) {
    res.status(409).json({ error: "Order could not be cancelled" });
    return;
  }

  await db.insert(orderStatusHistoryTable).values({
    id: `${orderId}_cancelled_courier_${Date.now()}`,
    orderId,
    status: "searching",
  });

  notifyOrderUpdate(order.userId, updated[0]);
  await sendOrderPush(order.userId, "عذراً، المندوب ألغى الطلب. سيتم البحث عن مندوب آخر.");

  res.json({ success: true });
});

const DEFAULT_DAILY_FEE = 5000;

router.get("/courier/earnings", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const periodParam = (req.query.period as string) || "today";
  const validPeriods = ["day", "today", "week", "month", "total"] as const;
  type PeriodParam = typeof validPeriods[number];
  type PeriodKey = "today" | "week" | "month" | "total";
  const normalizedPeriod: PeriodKey = (() => {
    const p = validPeriods.includes(periodParam as PeriodParam) ? periodParam as PeriodParam : "today";
    if (p === "day" || p === "today") return "today";
    if (p === "week") return "week";
    if (p === "month") return "month";
    return "total";
  })();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setDate(1);

  const periodStart: Date | null =
    normalizedPeriod === "today" ? todayStart :
    normalizedPeriod === "week" ? weekStart :
    normalizedPeriod === "month" ? monthStart :
    null;

  type AggRow = { totalEarnings: string | null; totalCount: string | null };
  type RecentRow = { id: string; restaurantName: string; address: string; updatedAt: Date; deliveryFee: number };

  const [aggResult, recentResult, todayAggResult, subRow, settingRow] = await Promise.all([
    periodStart
      ? db.execute(sql`
          SELECT
            COALESCE(SUM(COALESCE(o.delivery_fee, 0)), 0)::text AS "totalEarnings",
            COUNT(*)::text AS "totalCount"
          FROM orders o
          WHERE o.courier_id = ${courierId}
            AND o.status = 'delivered'
            AND o.updated_at >= ${periodStart.toISOString()}
        `)
      : db.execute(sql`
          SELECT
            COALESCE(SUM(COALESCE(o.delivery_fee, 0)), 0)::text AS "totalEarnings",
            COUNT(*)::text AS "totalCount"
          FROM orders o
          WHERE o.courier_id = ${courierId}
            AND o.status = 'delivered'
        `),
    periodStart
      ? db.execute(sql`
          SELECT
            o.id,
            o.restaurant_name AS "restaurantName",
            o.address,
            o.updated_at AS "updatedAt",
            COALESCE(o.delivery_fee, 0) AS "deliveryFee"
          FROM orders o
          WHERE o.courier_id = ${courierId}
            AND o.status = 'delivered'
            AND o.updated_at >= ${periodStart.toISOString()}
          ORDER BY o.updated_at DESC
          LIMIT 50
        `)
      : db.execute(sql`
          SELECT
            o.id,
            o.restaurant_name AS "restaurantName",
            o.address,
            o.updated_at AS "updatedAt",
            COALESCE(o.delivery_fee, 0) AS "deliveryFee"
          FROM orders o
          WHERE o.courier_id = ${courierId}
            AND o.status = 'delivered'
          ORDER BY o.updated_at DESC
          LIMIT 50
        `),
    normalizedPeriod !== "today"
      ? db.execute(sql`
          SELECT
            COALESCE(SUM(COALESCE(o.delivery_fee, 0)), 0)::text AS "totalEarnings",
            COUNT(*)::text AS "totalCount"
          FROM orders o
          WHERE o.courier_id = ${courierId}
            AND o.status = 'delivered'
            AND o.updated_at >= ${todayStart.toISOString()}
        `)
      : Promise.resolve(null),
    db
      .select()
      .from(courierSubscriptionsTable)
      .where(and(
        eq(courierSubscriptionsTable.courierId, courierId),
        eq(courierSubscriptionsTable.date, new Date().toISOString().slice(0, 10)),
      ))
      .limit(1),
    db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "daily_subscription_fee"))
      .limit(1),
  ]);

  const aggRow = aggResult.rows[0] as AggRow;
  const periodEarnings = Number(aggRow?.totalEarnings ?? 0);
  const periodDeliveriesCount = Number(aggRow?.totalCount ?? 0);

  const recentDeliveries = (recentResult.rows as RecentRow[]).map((row) => ({
    id: row.id,
    restaurantName: row.restaurantName,
    address: row.address,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : (row.updatedAt as Date).toISOString(),
    earnings: Number(row.deliveryFee),
  }));

  let todayEarnings: number;
  let todayDeliveriesCount: number;
  if (normalizedPeriod === "today") {
    todayEarnings = periodEarnings;
    todayDeliveriesCount = periodDeliveriesCount;
  } else {
    const todayAgg = todayAggResult?.rows[0] as AggRow | undefined;
    todayEarnings = Number(todayAgg?.totalEarnings ?? 0);
    todayDeliveriesCount = Number(todayAgg?.totalCount ?? 0);
  }

  const defaultFee = settingRow[0]?.value ? parseInt(settingRow[0].value, 10) || DEFAULT_DAILY_FEE : DEFAULT_DAILY_FEE;
  const todaySubscriptionStatus = subRow[0]?.status ?? "pending";
  const todaySubscriptionFee = subRow[0]?.amount ?? defaultFee;
  const todayNetEarnings = todaySubscriptionStatus === "paid"
    ? todayEarnings - todaySubscriptionFee
    : todayEarnings;

  res.json({
    period: normalizedPeriod,
    periodEarnings,
    periodDeliveries: periodDeliveriesCount,
    todayEarnings,
    todayDeliveries: todayDeliveriesCount,
    todaySubscriptionFee,
    todaySubscriptionStatus,
    todayNetEarnings,
    recentDeliveries,
  });
});

router.get("/courier/subscription/today", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const today = new Date().toISOString().slice(0, 10);

  const [subRow, settingRow] = await Promise.all([
    db
      .select()
      .from(courierSubscriptionsTable)
      .where(and(
        eq(courierSubscriptionsTable.courierId, courierId),
        eq(courierSubscriptionsTable.date, today),
      ))
      .limit(1),
    db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "daily_subscription_fee"))
      .limit(1),
  ]);

  const defaultAmount = settingRow[0]?.value
    ? parseInt(settingRow[0].value, 10) || DEFAULT_DAILY_FEE
    : DEFAULT_DAILY_FEE;

  if (subRow.length === 0) {
    res.json({ status: "pending", amount: defaultAmount, date: today });
    return;
  }

  const sub = subRow[0]!;
  res.json({ status: sub.status, amount: sub.amount, date: today, note: sub.note });
});

const rateCustomerSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().default(""),
});

router.post("/courier/orders/:orderId/rate-customer", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const parsed = rateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { stars, comment } = parsed.data;

  const order = await db
    .select({ status: ordersTable.status, courierId: ordersTable.courierId, userId: ordersTable.userId })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (order.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const o = order[0]!;
  if (o.courierId !== courierId) {
    res.status(403).json({ error: "Not your order" });
    return;
  }
  if (o.status !== "delivered") {
    res.status(409).json({ error: "Order must be delivered first" });
    return;
  }

  const existing = await db
    .select({ id: courierCustomerRatingsTable.id })
    .from(courierCustomerRatingsTable)
    .where(and(
      eq(courierCustomerRatingsTable.orderId, orderId),
      eq(courierCustomerRatingsTable.courierId, courierId),
    ))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Already rated this customer" });
    return;
  }

  const id = `ccr_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(courierCustomerRatingsTable)
    .values({ id, orderId, courierId, customerId: o.userId, stars, comment })
    .returning();

  res.status(201).json(row);
});

router.get("/courier/subscription/history", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const rows = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(eq(courierSubscriptionsTable.courierId, courierId))
    .orderBy(sql`${courierSubscriptionsTable.date} DESC`)
    .limit(60);

  res.json(rows);
});

router.get("/courier/orders/history", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const rows = await db.execute(sql`
    SELECT
      o.id,
      o.restaurant_name AS "restaurantName",
      o.address,
      o.order_text AS "orderText",
      o.status,
      COALESCE(o.delivery_fee, 0) AS "deliveryFee",
      o.updated_at AS "updatedAt",
      o.created_at AS "createdAt",
      COALESCE(r.courier_stars, 0) AS "customerRating"
    FROM orders o
    LEFT JOIN order_ratings r ON r.order_id = o.id
    WHERE o.courier_id = ${courierId}
      AND o.status = 'delivered'
    ORDER BY o.updated_at DESC
    LIMIT 100
  `);

  type OrderHistoryRow = {
    id: string;
    restaurantName: string;
    address: string;
    orderText: string;
    status: string;
    deliveryFee: number;
    updatedAt: string | Date;
    createdAt: string | Date;
    customerRating: number;
  };

  const orders = (rows.rows as OrderHistoryRow[]).map((r) => ({
    id: r.id,
    restaurantName: r.restaurantName || "",
    address: r.address || "",
    orderText: r.orderText || "",
    status: r.status,
    deliveryFee: Number(r.deliveryFee),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : (r.updatedAt as Date).toISOString(),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : (r.createdAt as Date).toISOString(),
    customerRating: Number(r.customerRating),
  }));

  res.json(orders);
});

router.get("/courier/my-ratings", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const ratings = await db.execute(sql`
    SELECT
      r.id,
      r.order_id AS "orderId",
      r.courier_stars AS "courierStars",
      r.comment,
      r.restaurant_name AS "restaurantName",
      r.created_at AS "createdAt"
    FROM order_ratings r
    WHERE r.courier_id = ${courierId}
      AND r.courier_stars IS NOT NULL
    ORDER BY r.created_at DESC
    LIMIT 50
  `);

  type RatingRow = {
    id: string;
    orderId: string;
    courierStars: number;
    comment: string;
    restaurantName: string;
    createdAt: string;
  };

  const rows = (ratings.rows as RatingRow[]).map((r) => ({
    id: r.id,
    orderId: r.orderId,
    stars: Number(r.courierStars),
    comment: r.comment || "",
    restaurantName: r.restaurantName || "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : (r.createdAt as unknown as Date).toISOString(),
  }));

  const avgStars = rows.length > 0
    ? rows.reduce((s, r) => s + r.stars, 0) / rows.length
    : null;

  res.json({ ratings: rows, avgStars: avgStars ? Number(avgStars.toFixed(2)) : null, total: rows.length });
});

router.get("/courier/wallet", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const [userRow, transactions] = await Promise.all([
    db
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, courierId))
      .limit(1),
    db
      .select()
      .from(courierWalletTransactionsTable)
      .where(eq(courierWalletTransactionsTable.courierId, courierId))
      .orderBy(desc(courierWalletTransactionsTable.createdAt))
      .limit(30),
  ]);

  res.json({
    balance: userRow[0]?.walletBalance ?? 0,
    transactions,
  });
});

const depositRequestSchema = z.object({
  amount: z.number().int().positive(),
  note: z.string().max(500).optional().default(""),
});

router.post("/courier/wallet/deposit-request", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const parsed = depositRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "amount (positive integer) required" });
    return;
  }

  const id = `wdep_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(courierWalletTransactionsTable)
    .values({
      id,
      courierId,
      amount: parsed.data.amount,
      type: "deposit_request",
      status: "pending",
      note: parsed.data.note || null,
    })
    .returning();

  res.status(201).json(row);
});

const updateCourierProfileSchema = z.object({
  name: z.string().min(1).max(60).trim(),
});

router.patch("/courier/profile", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const body = updateCourierProfileSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "الاسم مطلوب ويجب أن يكون بين 1 و 60 حرفاً" });
    return;
  }

  const rows = await db
    .update(usersTable)
    .set({ name: body.data.name })
    .where(eq(usersTable.id, courierId))
    .returning({ id: usersTable.id, name: usersTable.name });

  if (rows.length === 0) {
    res.status(404).json({ error: "Courier not found" });
    return;
  }

  res.json(rows[0]);
});

export default router;
