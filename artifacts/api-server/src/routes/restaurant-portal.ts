import { Router, type Request, type Response, type NextFunction } from "express";
import { db, restaurantUsersTable, restaurantsTable, menuItemsTable, restaurantHoursTable, ordersTable, otpCodesTable, orderRatingsTable, promoCodesTable, promoUsesTable } from "@workspace/db";
import { eq, desc, and, gte, count, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendSmsViaGateway } from "../lib/sms";
import { whatsappManager } from "../lib/whatsapp";
import { objectStorageClient } from "../lib/objectStorage";
import { composeBanner, BANNER_CONFIGS } from "../lib/promoBannerComposer";
import { randomUUID } from "crypto";

const router = Router();

const SEND_OTP_LIMIT = 3;
const SEND_OTP_WINDOW_MS = 5 * 60 * 1000;
const VERIFY_OTP_LIMIT = 5;
const VERIFY_OTP_WINDOW_MS = 10 * 60 * 1000;

const sendOtpBucket = new Map<string, { count: number; resetAt: number }>();
const verifyOtpBucket = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

interface RestaurantPortalPayload {
  restaurantUserId: string;
  restaurantId: string;
  phone: string;
  tokenType: "restaurant_portal";
}

async function requireRestaurantAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    res.status(503).json({ error: "Server configuration error" });
    return;
  }
  let payload: RestaurantPortalPayload;
  try {
    payload = jwt.verify(token, secret) as RestaurantPortalPayload;
    if (payload.tokenType !== "restaurant_portal" || !payload.restaurantId || !payload.restaurantUserId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const [user] = await db.select({ isActive: restaurantUsersTable.isActive }).from(restaurantUsersTable).where(eq(restaurantUsersTable.id, payload.restaurantUserId)).limit(1);
  if (!user || !user.isActive) {
    res.status(401).json({ error: "Account is disabled" });
    return;
  }
  (req as Request & { restaurantAuth?: RestaurantPortalPayload }).restaurantAuth = payload;
  next();
}

function getRestaurantAuth(req: Request): RestaurantPortalPayload {
  return (req as Request & { restaurantAuth?: RestaurantPortalPayload }).restaurantAuth!;
}

function issueToken(user: { id: string; restaurantId: string; phone: string }): string {
  const payload: RestaurantPortalPayload = {
    restaurantUserId: user.id,
    restaurantId: user.restaurantId,
    phone: user.phone,
    tokenType: "restaurant_portal",
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "30d" });
}

router.post("/restaurant-portal/auth/login", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رقم الهاتف وكلمة المرور مطلوبان" }); return; }

  const [user] = await db.select().from(restaurantUsersTable).where(eq(restaurantUsersTable.phone, parsed.data.phone)).limit(1);
  if (!user || !user.isActive) { res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }); return; }
  if (user.authMode !== "password" || !user.passwordHash) { res.status(400).json({ error: "يرجى تسجيل الدخول عبر رمز OTP" }); return; }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }); return; }

  const [restaurant] = await db.select({ id: restaurantsTable.id, nameAr: restaurantsTable.nameAr, name: restaurantsTable.name, image: restaurantsTable.image }).from(restaurantsTable).where(eq(restaurantsTable.id, user.restaurantId)).limit(1);
  let token: string;
  try { token = issueToken(user); } catch { res.status(503).json({ error: "Server configuration error" }); return; }
  res.json({ token, restaurant, authMode: user.authMode });
});

router.post("/restaurant-portal/auth/request-otp", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رقم الهاتف مطلوب" }); return; }

  const ip = getClientIp(req);
  if (!checkRateLimit(sendOtpBucket, `phone:${parsed.data.phone}`, SEND_OTP_LIMIT, SEND_OTP_WINDOW_MS) ||
      !checkRateLimit(sendOtpBucket, `ip:${ip}`, SEND_OTP_LIMIT * 3, SEND_OTP_WINDOW_MS)) {
    res.status(429).json({ error: "محاولات كثيرة — حاول لاحقاً" }); return;
  }

  const [user] = await db.select().from(restaurantUsersTable).where(eq(restaurantUsersTable.phone, parsed.data.phone)).limit(1);
  if (!user || !user.isActive) { res.status(404).json({ error: "لا يوجد حساب بهذا الرقم" }); return; }
  if (user.authMode !== "otp") { res.status(400).json({ error: "هذا الحساب يستخدم كلمة المرور للدخول" }); return; }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const otpId = `rotp_${Date.now()}`;

  await db.update(otpCodesTable).set({ used: true }).where(and(eq(otpCodesTable.phone, parsed.data.phone), eq(otpCodesTable.used, false)));
  await db.insert(otpCodesTable).values({ id: otpId, phone: parsed.data.phone, code, expiresAt });

  const message = `رمز التحقق الخاص بك في زبوني: ${code}`;
  let channel: "whatsapp" | "sms" = "sms";
  const waSent = await whatsappManager.sendMessage(parsed.data.phone, message);
  if (waSent) {
    channel = "whatsapp";
  } else {
    try {
      await sendSmsViaGateway(parsed.data.phone, message);
    } catch (err) {
      console.warn("[restaurant-portal] SMS skipped (no gateway configured):", (err as Error).message);
    }
  }

  const devCode = process.env["NODE_ENV"] !== "production" ? code : undefined;
  res.json({ ok: true, channel, devCode });
});

router.post("/restaurant-portal/auth/verify-otp", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(1), code: z.string().min(4) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }

  const ip = getClientIp(req);
  if (!checkRateLimit(verifyOtpBucket, `phone:${parsed.data.phone}`, VERIFY_OTP_LIMIT, VERIFY_OTP_WINDOW_MS) ||
      !checkRateLimit(verifyOtpBucket, `ip:${ip}`, VERIFY_OTP_LIMIT * 3, VERIFY_OTP_WINDOW_MS)) {
    res.status(429).json({ error: "محاولات كثيرة — حاول لاحقاً" }); return;
  }

  const [user] = await db.select().from(restaurantUsersTable).where(eq(restaurantUsersTable.phone, parsed.data.phone)).limit(1);
  if (!user || !user.isActive) { res.status(404).json({ error: "لا يوجد حساب بهذا الرقم" }); return; }
  if (user.authMode !== "otp") { res.status(400).json({ error: "هذا الحساب يستخدم كلمة المرور للدخول" }); return; }

  const now = new Date();
  const [otp] = await db.select().from(otpCodesTable)
    .where(and(eq(otpCodesTable.phone, parsed.data.phone), eq(otpCodesTable.used, false), eq(otpCodesTable.code, parsed.data.code)))
    .orderBy(desc(otpCodesTable.createdAt)).limit(1);

  if (!otp || otp.expiresAt < now) { res.status(401).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" }); return; }
  await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otp.id));

  const [restaurant] = await db.select({ id: restaurantsTable.id, nameAr: restaurantsTable.nameAr, name: restaurantsTable.name, image: restaurantsTable.image }).from(restaurantsTable).where(eq(restaurantsTable.id, user.restaurantId)).limit(1);
  let token: string;
  try { token = issueToken(user); } catch { res.status(503).json({ error: "Server configuration error" }); return; }
  res.json({ token, restaurant, authMode: user.authMode });
});

router.get("/restaurant-portal/me", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, restaurantId)).limit(1);
  if (!restaurant) { res.status(404).json({ error: "المطعم غير موجود" }); return; }
  res.json(restaurant);
});

router.put("/restaurant-portal/restaurant", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const parsed = z.object({
    nameAr: z.string().min(1).optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    deliveryFee: z.number().min(0).optional(),
    minOrder: z.number().min(0).optional(),
    deliveryTime: z.string().optional(),
    image: z.string().optional(),
    isOpen: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db.update(restaurantsTable).set(parsed.data).where(eq(restaurantsTable.id, restaurantId)).returning();
  res.json(updated);
});

router.get("/restaurant-portal/menu", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const items = await db.select().from(menuItemsTable).where(eq(menuItemsTable.restaurantId, restaurantId)).orderBy(menuItemsTable.category, menuItemsTable.name);
  res.json(items);
});

router.post("/restaurant-portal/menu", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const parsed = z.object({
    name: z.string().min(1),
    nameAr: z.string().min(1),
    price: z.number().min(0),
    category: z.string().default(""),
    categoryAr: z.string().default(""),
    description: z.string().default(""),
    descriptionAr: z.string().default(""),
    image: z.string().default(""),
    isPopular: z.boolean().default(false),
    subcategory: z.string().nullable().optional(),
    subcategoryAr: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const id = `mi_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const [item] = await db.insert(menuItemsTable).values({ id, restaurantId, ...parsed.data }).returning();
  res.status(201).json(item);
});

router.put("/restaurant-portal/menu/:itemId", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const itemId = String(req.params["itemId"]);
  const [existing] = await db.select({ id: menuItemsTable.id }).from(menuItemsTable).where(and(eq(menuItemsTable.id, itemId), eq(menuItemsTable.restaurantId, restaurantId))).limit(1);
  if (!existing) { res.status(404).json({ error: "الصنف غير موجود" }); return; }
  const parsed = z.object({
    name: z.string().optional(),
    nameAr: z.string().optional(),
    price: z.number().min(0).optional(),
    category: z.string().optional(),
    categoryAr: z.string().optional(),
    description: z.string().optional(),
    descriptionAr: z.string().optional(),
    image: z.string().optional(),
    isPopular: z.boolean().optional(),
    subcategory: z.string().nullable().optional(),
    subcategoryAr: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [updated] = await db.update(menuItemsTable).set(parsed.data).where(eq(menuItemsTable.id, itemId)).returning();
  res.json(updated);
});

router.patch("/restaurant-portal/menu/:itemId/availability", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const itemId = String(req.params["itemId"]);
  const parsed = z.object({ isAvailable: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "isAvailable (boolean) مطلوب" }); return; }
  const [existing] = await db.select({ id: menuItemsTable.id }).from(menuItemsTable).where(and(eq(menuItemsTable.id, itemId), eq(menuItemsTable.restaurantId, restaurantId))).limit(1);
  if (!existing) { res.status(404).json({ error: "الصنف غير موجود" }); return; }
  const [updated] = await db.update(menuItemsTable).set({ isAvailable: parsed.data.isAvailable }).where(eq(menuItemsTable.id, itemId)).returning();
  res.json(updated);
});

router.delete("/restaurant-portal/menu/:itemId", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const itemId = String(req.params["itemId"]);
  const [existing] = await db.select({ id: menuItemsTable.id }).from(menuItemsTable).where(and(eq(menuItemsTable.id, itemId), eq(menuItemsTable.restaurantId, restaurantId))).limit(1);
  if (!existing) { res.status(404).json({ error: "الصنف غير موجود" }); return; }
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, itemId));
  res.status(204).end();
});

router.get("/restaurant-portal/hours", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const hours = await db.select().from(restaurantHoursTable).where(eq(restaurantHoursTable.restaurantId, restaurantId)).orderBy(restaurantHoursTable.dayOfWeek);
  res.json(hours);
});

router.put("/restaurant-portal/hours", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const parsed = z.object({
    hours: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      openTime: z.string(),
      closeTime: z.string(),
      isClosed: z.boolean(),
    })),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await db.transaction(async (tx) => {
    await tx.delete(restaurantHoursTable).where(eq(restaurantHoursTable.restaurantId, restaurantId));
    for (const h of parsed.data.hours) {
      const id = `rh_${restaurantId}_${h.dayOfWeek}_${Date.now()}`;
      await tx.insert(restaurantHoursTable).values({ id, restaurantId, ...h });
    }
  });

  const hours = await db.select().from(restaurantHoursTable).where(eq(restaurantHoursTable.restaurantId, restaurantId)).orderBy(restaurantHoursTable.dayOfWeek);
  res.json(hours);
});

router.get("/restaurant-portal/orders", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50")), 100);
  const orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.restaurantId, restaurantId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);
  res.json(orders);
});

router.get("/restaurant-portal/analytics", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);

  // Damascus is UTC+3 — compute consistent period boundaries in Damascus timezone
  const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowUtc = new Date();
  // Shift to Damascus "local" for date math
  const nowLocal = new Date(nowUtc.getTime() + DAMASCUS_OFFSET_MS);
  const todayLocalMidnight = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()));
  const weekLocalMidnight = new Date(todayLocalMidnight);
  weekLocalMidnight.setUTCDate(weekLocalMidnight.getUTCDate() - 6);
  // Convert back to UTC for DB comparisons
  const todayStartUtc = new Date(todayLocalMidnight.getTime() - DAMASCUS_OFFSET_MS);
  const weekStartUtc = new Date(weekLocalMidnight.getTime() - DAMASCUS_OFFSET_MS);

  const [todayStats, weekStats, dailyRows, peakRows, menuItems] = await Promise.all([
    db.select({
      orders: count(),
      revenue: sql<number>`COALESCE(SUM(total_price), 0)`,
      deliveryRevenue: sql<number>`COALESCE(SUM(delivery_fee), 0)`,
    }).from(ordersTable).where(and(
      eq(ordersTable.restaurantId, restaurantId),
      eq(ordersTable.status, "delivered"),
      gte(ordersTable.createdAt, todayStartUtc),
    )),
    db.select({
      orders: count(),
      revenue: sql<number>`COALESCE(SUM(total_price), 0)`,
      deliveryRevenue: sql<number>`COALESCE(SUM(delivery_fee), 0)`,
    }).from(ordersTable).where(and(
      eq(ordersTable.restaurantId, restaurantId),
      eq(ordersTable.status, "delivered"),
      gte(ordersTable.createdAt, weekStartUtc),
    )),
    db.select({
      date: sql<string>`TO_CHAR(created_at AT TIME ZONE 'Asia/Damascus', 'YYYY-MM-DD')`,
      orders: count(),
      revenue: sql<number>`COALESCE(SUM(total_price), 0)`,
    }).from(ordersTable).where(and(
      eq(ordersTable.restaurantId, restaurantId),
      eq(ordersTable.status, "delivered"),
      gte(ordersTable.createdAt, weekStartUtc),
    )).groupBy(sql`TO_CHAR(created_at AT TIME ZONE 'Asia/Damascus', 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(created_at AT TIME ZONE 'Asia/Damascus', 'YYYY-MM-DD')`),
    db.select({
      hour: sql<number>`EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Damascus')::int`,
      count: count(),
    }).from(ordersTable).where(and(
      eq(ordersTable.restaurantId, restaurantId),
      gte(ordersTable.createdAt, weekStartUtc),
    )).groupBy(sql`EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Damascus')::int`)
      .orderBy(sql`EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Damascus')::int`),
    db.select({ nameAr: menuItemsTable.nameAr, name: menuItemsTable.name })
      .from(menuItemsTable)
      .where(eq(menuItemsTable.restaurantId, restaurantId)),
  ]);

  // Build daily series using Damascus-local dates (consistent with SQL grouping)
  const dailyMap = new Map(dailyRows.map(r => [r.date, r]));
  const dailySeries = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayLocalMidnight);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const row = dailyMap.get(dateStr);
    return { date: dateStr, orders: Number(row?.orders ?? 0), revenue: Number(row?.revenue ?? 0) };
  });

  // Count how many delivered orders mention each menu item (text match)
  const deliveredOrders = await db.select({ orderText: ordersTable.orderText })
    .from(ordersTable)
    .where(and(eq(ordersTable.restaurantId, restaurantId), eq(ordersTable.status, "delivered")));

  const itemCounts = menuItems
    .map(item => {
      const terms = [item.nameAr, item.name].filter(Boolean).map(n => n.toLowerCase());
      const matchCount = deliveredOrders.filter(o =>
        terms.some(t => o.orderText.toLowerCase().includes(t)),
      ).length;
      return { name: item.nameAr || item.name, count: matchCount };
    })
    .filter(i => i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    todayOrders: Number(todayStats[0]?.orders ?? 0),
    todayRevenue: Number(todayStats[0]?.revenue ?? 0),
    todayDeliveryRevenue: Number(todayStats[0]?.deliveryRevenue ?? 0),
    weekOrders: Number(weekStats[0]?.orders ?? 0),
    weekRevenue: Number(weekStats[0]?.revenue ?? 0),
    weekDeliveryRevenue: Number(weekStats[0]?.deliveryRevenue ?? 0),
    dailySeries,
    topItems: itemCounts,
    peakHours: peakRows.map(r => ({ hour: Number(r.hour), count: Number(r.count) })),
  });
});

router.get("/restaurant-portal/ratings", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);

  const [ratings, statsRows] = await Promise.all([
    db.select({
      id: orderRatingsTable.id,
      restaurantStars: orderRatingsTable.restaurantStars,
      comment: orderRatingsTable.comment,
      createdAt: orderRatingsTable.createdAt,
    }).from(orderRatingsTable)
      .where(eq(orderRatingsTable.restaurantId, restaurantId))
      .orderBy(desc(orderRatingsTable.createdAt))
      .limit(100),
    db.select({
      stars: orderRatingsTable.restaurantStars,
      count: count(),
    }).from(orderRatingsTable)
      .where(eq(orderRatingsTable.restaurantId, restaurantId))
      .groupBy(orderRatingsTable.restaurantStars),
  ]);

  const totalCount = statsRows.reduce((s, r) => s + Number(r.count), 0);
  const weightedSum = statsRows.reduce((s, r) => s + r.stars * Number(r.count), 0);
  const avgStars = totalCount > 0 ? Math.round((weightedSum / totalCount) * 10) / 10 : 0;

  const distribution = [1, 2, 3, 4, 5].map(s => {
    const row = statsRows.find(r => r.stars === s);
    const cnt = Number(row?.count ?? 0);
    return { stars: s, count: cnt, pct: totalCount > 0 ? (cnt / totalCount) * 100 : 0 };
  });

  res.json({
    avgStars,
    totalCount,
    distribution,
    ratings: ratings.map(r => ({
      id: r.id,
      restaurantStars: r.restaurantStars,
      comment: r.comment,
      createdAt: r.createdAt,
    })),
  });
});

router.get("/restaurant-portal/stats", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const [restaurant] = await db.select({ rating: restaurantsTable.rating, isOpen: restaurantsTable.isOpen }).from(restaurantsTable).where(eq(restaurantsTable.id, restaurantId)).limit(1);
  if (!restaurant) { res.json({}); return; }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [allOrders, todayOrders, menuCount] = await Promise.all([
    db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.restaurantId, restaurantId)),
    db.select({ count: count(), deliveredCount: sql<number>`COUNT(*) FILTER (WHERE status = 'delivered')` }).from(ordersTable).where(and(eq(ordersTable.restaurantId, restaurantId), gte(ordersTable.createdAt, todayStart))),
    db.select({ count: count() }).from(menuItemsTable).where(eq(menuItemsTable.restaurantId, restaurantId)),
  ]);

  res.json({
    totalOrders: allOrders[0]?.count ?? 0,
    todayOrders: todayOrders[0]?.count ?? 0,
    todayDelivered: Number(todayOrders[0]?.deliveredCount ?? 0),
    menuItemCount: menuCount[0]?.count ?? 0,
    rating: restaurant.rating,
    isOpen: restaurant.isOpen,
  });
});

function parseStoragePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid storage path: must contain at least a bucket name");
  return { bucketName: parts[1]!, objectName: parts.slice(2).join("/") };
}

function getPublicStorageBase(): string {
  const paths = (process.env["PUBLIC_OBJECT_SEARCH_PATHS"] ?? "").split(",").map(p => p.trim()).filter(Boolean);
  if (!paths[0]) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not configured");
  return paths[0];
}

async function readFoodImageFromStorage(foodObjectPath: string): Promise<{ buffer: Buffer; contentType: string }> {
  const base = getPublicStorageBase();
  const fullPath = `${base}/${foodObjectPath}`;
  const { bucketName, objectName } = parseStoragePath(fullPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new Error("صورة الوجبة غير موجودة في المستودع");
  const [buffer] = await file.download();
  const [meta] = await file.getMetadata();
  const contentType = (meta.contentType as string | undefined) ?? "image/jpeg";
  return { buffer, contentType };
}

async function uploadBannerToPublicStorage(buffer: Buffer, restaurantId: string, filename: string): Promise<string> {
  const base = getPublicStorageBase();
  const relPath = `promo-banners/${restaurantId}/${filename}`;
  const fullPath = `${base}/${relPath}`;
  const { bucketName, objectName } = parseStoragePath(fullPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buffer, { contentType: "image/png", resumable: false });
  return `/api/storage/public-objects/${relPath}`;
}


interface PromoTemplate {
  id: string;
  nameAr: string;
  description: string;
  swatch: string;
  buildPrompt: (restaurantName: string, oldPrice: string, newPrice: string, tagline?: string) => string;
}

const PROMO_TEMPLATES: PromoTemplate[] = [
  {
    id: "classic-red",
    nameAr: "وردي ناري",
    description: "مثل Yemeksepeti — وردي فيوشيا نابض مع كوبون أبيض",
    swatch: "🩷",
    buildPrompt: (name, old, now, tagline) =>
      `Create a square 1:1 food delivery promotional banner in the exact style of Yemeksepeti app marketing — bold, modern, professional.

BACKGROUND: Solid hot magenta-pink (#E91E8C) — flat, no gradients, no textures. The entire canvas is this vibrant pink.

COMPOSITION:
- Top-left: A small white rounded-rectangle pill badge containing the restaurant name "${name}" in bold dark Arabic text, small and clean — like an app logo tag.
- Center-left area: 2–3 lines of large bold white Arabic text. First line regular weight, second line extremely bold and large. ${tagline ? `Text reads: "${tagline}"` : `Text reads: "عرض خاص لفترة محدودة"`}
- Center: A horizontal coupon/ticket shape in white with a dashed vertical divider in the middle. Left half has a mint-green (#A8E6CF) background showing old price "${old}" in dark crossed-out Arabic numerals. Right half shows new price "${now}" in large bold dark Arabic numerals with a small Arabic label above it.
- Bottom-left or top-right: A single beautifully photographed food item (burger or pizza slice) with a completely transparent/removed background, floating naturally on the pink — cut-out style, no shadow box, the food image bleeds to the edge. The food looks delicious and high quality.

TYPOGRAPHY: Modern rounded sans-serif Arabic. All Arabic script. No decorative borders. No textures.
STYLE: Exactly like Yemeksepeti / Getir app promotional social media post. Clean, energetic, delivery-app quality. 1080x1080px social media standard.`,
  },
  {
    id: "dark-luxury",
    nameAr: "أسود ذهبي راقي",
    description: "خلفية سوداء مع أكل طافٍ وبادج ذهبي فاخر",
    swatch: "🖤",
    buildPrompt: (name, old, now, tagline) =>
      `Create a square 1:1 food delivery promotional banner in a premium luxury delivery-app style — dark, sophisticated, modern.

BACKGROUND: Flat deep charcoal black (#1A1A1A) — no textures, no gradients. Clean solid dark canvas.

COMPOSITION:
- Top-left: A small rounded-rectangle white pill badge with restaurant name "${name}" in bold dark Arabic text — clean minimal app-style tag.
- Center-left: Large bold white Arabic text block, 2 lines. ${tagline ? `"${tagline}"` : `"عرض حصري لهذا الأسبوع"`} — first line normal weight, second line ultra-bold.
- Center: A sleek horizontal pill/coupon shape with a dark gold (#C9A84C) left half showing old price "${old}" crossed out in white Arabic numerals, and a white right half showing new price "${now}" in large bold dark Arabic numerals. Clean separation with a subtle dashed divider.
- Top-right or bottom-right: A beautifully lit food item (gourmet burger, sushi, or steak) photographed with transparent background — cut-out floating on the dark canvas, slightly oversized, bleeding to the edge. Professional food photography quality.

TYPOGRAPHY: Bold modern Arabic sans-serif throughout. All text in Arabic script. Gold (#C9A84C) and white only.
STYLE: Premium dark delivery-app banner. Like a luxury restaurant on a high-end food delivery platform. Clean, no clutter, professional 1080x1080.`,
  },
  {
    id: "fresh-green",
    nameAr: "أخضر طازج عصري",
    description: "أخضر زمردي نابض مع أكل صحي طافٍ وكوبون أبيض",
    swatch: "🟢",
    buildPrompt: (name, old, now, tagline) =>
      `Create a square 1:1 food promotional banner in a fresh, modern delivery-app style.

BACKGROUND: Solid vibrant emerald green (#00A86B) — flat, no texture, no gradients. Clean full-canvas green.

COMPOSITION:
- Top-left: Small white rounded-rectangle pill with restaurant name "${name}" in bold dark Arabic — clean app-style tag.
- Center-left: 2 lines of large bold white Arabic text. ${tagline ? `"${tagline}"` : `"طازج يومياً على بابك"`} — second line ultra-bold and larger.
- Center: Horizontal white coupon/ticket shape with dashed middle divider. Left half light green (#C8F5E0) with old price "${old}" in crossed-out dark Arabic numerals. Right half white with new price "${now}" in large bold green Arabic numerals.
- Top-right or bottom-right: Fresh food item (salad bowl, healthy wrap, fruit plate, or grilled chicken) with transparent background cut-out — floating on green, oversize, edge-bleeding. Vibrant natural colors.

TYPOGRAPHY: Clean modern rounded Arabic sans-serif. All Arabic script.
STYLE: Fresh food delivery promotional post — energetic, healthy, clean. Exactly like top delivery apps' social media marketing. 1080x1080px.`,
  },
  {
    id: "bold-orange",
    nameAr: "برتقالي ناري",
    description: "برتقالي نابض بطاقة سعر بيضاء وأكل طافٍ",
    swatch: "🟠",
    buildPrompt: (name, old, now, tagline) =>
      `Create a square 1:1 food promotional banner in a bold, energetic delivery-app style.

BACKGROUND: Solid vivid orange (#FF6B00) — completely flat, no gradients, no patterns. Strong orange canvas.

COMPOSITION:
- Top-left: Small white rounded-rectangle pill badge with restaurant name "${name}" in bold dark Arabic text — minimal clean app tag.
- Center-left: 2 lines of large bold white Arabic text. ${tagline ? `"${tagline}"` : `"عرض اليوم فقط لا تفوّته"`} — second line ultra-bold, larger size.
- Center: A horizontal white coupon/ticket badge with perforated dashed divider. Left half with a warm yellow (#FFE066) background showing old price "${old}" in crossed-out dark Arabic numerals. Right half white showing new price "${now}" in large bold orange Arabic numerals with Arabic label above.
- Top-right or bottom-left: Appetizing food with transparent background — shawarma, pizza, fried chicken, or kebab — cut-out floating on orange, oversized and slightly tilted for energy, bleeding off the canvas edge.

TYPOGRAPHY: Heavy bold Arabic rounded sans-serif. All Arabic script. High energy layout.
STYLE: Street food delivery energy, exactly like top delivery app promotions on Instagram. 1080x1080px professional banner.`,
  },
  {
    id: "clean-white",
    nameAr: "أبيض نظيف عصري",
    description: "خلفية بيضاء ناعمة مع تفاصيل ملونة وأكل طافٍ",
    swatch: "⬜",
    buildPrompt: (name, old, now, tagline) =>
      `Create a square 1:1 food promotional banner in a clean, minimal modern delivery-app style.

BACKGROUND: Pure soft white (#FAFAFA) — clean, flat, airy. A very subtle large rounded organic blob shape in very light pink (#FFE8F0) fills the bottom-right two-thirds of the canvas — like a soft background accent, not distracting.

COMPOSITION:
- Top-left: Small hot pink (#E91E8C) rounded-rectangle pill with restaurant name "${name}" in bold white Arabic text — vibrant contrast app tag.
- Center-left: 2 lines of large bold dark (#1A1A1A) Arabic text. ${tagline ? `"${tagline}"` : `"عرض خاص لزبائننا المميزين"`} — second line bolder and larger.
- Center: A horizontal coupon/ticket badge. Left half in hot pink (#E91E8C) showing old price "${old}" in crossed-out white Arabic numerals. Right half white with a pink border showing new price "${now}" in large bold dark Arabic numerals with small Arabic label.
- Bottom-right or top-right: Hero food item (gourmet burger, dessert, or coffee) with completely transparent background — cut-out floating on white, beautifully lit, oversized and natural, slightly bleeding off canvas.

TYPOGRAPHY: Modern clean Arabic sans-serif. Dark on white, white on pink. All Arabic script.
STYLE: Premium minimal food delivery social media post. Clean, aspirational, café/restaurant quality. 1080x1080px.`,
  },
  {
    id: "deep-blue",
    nameAr: "أزرق عميق جريء",
    description: "كحلي غامق نابض مع بادج أبيض وأكل طافٍ",
    swatch: "🔵",
    buildPrompt: (name, old, now, tagline) =>
      `Create a square 1:1 food promotional banner in a bold modern delivery-app style.

BACKGROUND: Solid deep cobalt blue (#1565C0) — flat, clean, no gradients or textures. Strong full-canvas blue.

COMPOSITION:
- Top-left: Small white rounded-rectangle pill badge with restaurant name "${name}" in bold dark blue Arabic text — clean minimal app-style tag.
- Center-left: 2 lines of large bold white Arabic text. ${tagline ? `"${tagline}"` : `"توصيل سريع وعرض لا يُقاوم"`} — first line regular, second line ultra-bold and large.
- Center: A horizontal white coupon/ticket shape with dashed divider. Left half with a light sky-blue (#B3D9FF) background showing old price "${old}" in crossed-out dark Arabic numerals. Right half pure white with new price "${now}" in large bold blue Arabic numerals and Arabic label above.
- Top-right or bottom-right: A beautifully photographed food item (seafood, grilled fish, or premium burger) with completely transparent background — cut-out floating on blue, oversized, bleeding off canvas. Professional quality.

TYPOGRAPHY: Bold modern Arabic rounded sans-serif. All Arabic script. High contrast white on blue.
STYLE: Professional food delivery promotional post — bold, trustworthy, exactly like top delivery app marketing on social media. 1080x1080px.`,
  },
];

router.get("/restaurant-portal/promos", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const promos = await db
    .select({
      id: promoCodesTable.id,
      code: promoCodesTable.code,
      type: promoCodesTable.type,
      value: promoCodesTable.value,
      maxUses: promoCodesTable.maxUses,
      maxUsesPerUser: promoCodesTable.maxUsesPerUser,
      expiresAt: promoCodesTable.expiresAt,
      isActive: promoCodesTable.isActive,
      createdAt: promoCodesTable.createdAt,
      usedCount: count(promoUsesTable.id),
    })
    .from(promoCodesTable)
    .leftJoin(promoUsesTable, eq(promoUsesTable.promoId, promoCodesTable.id))
    .where(eq(promoCodesTable.restaurantId, restaurantId))
    .groupBy(promoCodesTable.id)
    .orderBy(desc(promoCodesTable.createdAt));
  res.json(promos);
});

router.post("/restaurant-portal/promos", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const parsed = z.object({
    code: z.string().min(1).max(32).transform(v => v.toUpperCase()),
    type: z.enum(["percent", "fixed"]),
    value: z.number().positive(),
    maxUses: z.number().int().positive().nullable().optional(),
    maxUsesPerUser: z.number().int().min(1).default(1),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }); return; }

  const id = `rp_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const [promo] = await db.insert(promoCodesTable).values({
    id,
    restaurantId,
    code: parsed.data.code,
    type: parsed.data.type,
    value: parsed.data.value,
    maxUses: parsed.data.maxUses ?? null,
    maxUsesPerUser: parsed.data.maxUsesPerUser,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    isActive: parsed.data.isActive,
  }).returning();
  res.status(201).json(promo);
});

router.put("/restaurant-portal/promos/:id", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const promoId = String(req.params["id"]);
  const [existing] = await db.select({ id: promoCodesTable.id })
    .from(promoCodesTable)
    .where(and(eq(promoCodesTable.id, promoId), eq(promoCodesTable.restaurantId, restaurantId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "الكود غير موجود" }); return; }

  const parsed = z.object({
    code: z.string().min(1).max(32).transform(v => v.toUpperCase()).optional(),
    type: z.enum(["percent", "fixed"]).optional(),
    value: z.number().positive().optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    maxUsesPerUser: z.number().int().min(1).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.expiresAt !== undefined) {
    updateData["expiresAt"] = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  }

  const [updated] = await db.update(promoCodesTable).set(updateData).where(eq(promoCodesTable.id, promoId)).returning();
  res.json(updated);
});

router.delete("/restaurant-portal/promos/:id", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const promoId = String(req.params["id"]);
  const [existing] = await db.select({ id: promoCodesTable.id })
    .from(promoCodesTable)
    .where(and(eq(promoCodesTable.id, promoId), eq(promoCodesTable.restaurantId, restaurantId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "الكود غير موجود" }); return; }
  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, promoId));
  res.status(204).end();
});

router.get("/restaurant-portal/promo-templates", requireRestaurantAuth, (_req, res) => {
  const templates = PROMO_TEMPLATES.map(({ id, nameAr, description, swatch }) => ({ id, nameAr, description, swatch }));
  res.json(templates);
});

router.post("/restaurant-portal/promo-images/generate", requireRestaurantAuth, async (req, res) => {
  const parsed = z.object({
    foodObjectPath: z.string().optional(),
    oldPrice: z.string().min(1),
    newPrice: z.string().min(1),
    tagline: z.string().optional(),
    templateId: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }); return; }

  const { restaurantId } = getRestaurantAuth(req);
  const { foodObjectPath, oldPrice, newPrice, tagline, templateId } = parsed.data;

  const template = PROMO_TEMPLATES.find(t => t.id === templateId);
  if (!template) { res.status(400).json({ error: "القالب المختار غير موجود" }); return; }

  const [restaurant] = await db.select({ nameAr: restaurantsTable.nameAr }).from(restaurantsTable).where(eq(restaurantsTable.id, restaurantId)).limit(1);
  const restaurantName = restaurant?.nameAr ?? "مطعمنا";

  const bannerConfig = BANNER_CONFIGS[templateId];
  if (!bannerConfig) { res.status(400).json({ error: "القالب المختار غير مدعوم" }); return; }

  try {
    let foodBuffer: Buffer | undefined;
    if (foodObjectPath) {
      const { buffer: imgBuffer } = await readFoodImageFromStorage(foodObjectPath);
      foodBuffer = imgBuffer;
    }

    const bannerBuffer = await composeBanner(
      bannerConfig,
      restaurantName,
      oldPrice,
      newPrice,
      tagline ?? "عرض خاص لفترة محدودة",
      foodBuffer,
    );

    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.png`;
    const resultUrl = await uploadBannerToPublicStorage(bannerBuffer, restaurantId, filename);

    const id = `promo_${Date.now()}`;
    const foodPublicUrl = foodObjectPath ? `/api/storage/public-objects/${foodObjectPath}` : null;
    await db.execute(sql`
      INSERT INTO promo_images (id, restaurant_id, restaurant_name, food_image_url, old_price, new_price, tagline, result_url, template_id)
      VALUES (${id}, ${restaurantId}, ${restaurantName}, ${foodPublicUrl}, ${oldPrice}, ${newPrice}, ${tagline ?? null}, ${resultUrl}, ${templateId})
    `);

    res.json({ id, resultUrl, restaurantName, oldPrice, newPrice, tagline, templateId, templateName: template.nameAr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "خطأ غير معروف";
    res.status(500).json({ error: `فشل توليد الصورة: ${msg}` });
  }
});

router.get("/restaurant-portal/promo-images", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const rows = await db.execute(sql`
    SELECT id, restaurant_id, restaurant_name, food_image_url, old_price, new_price, tagline, result_url, template_id, created_at
    FROM promo_images
    WHERE restaurant_id = ${restaurantId}
    ORDER BY created_at DESC
    LIMIT 10
  `);
  const items = rows.rows.map((r: Record<string, unknown>) => ({
    id: r["id"] as string,
    restaurantId: r["restaurant_id"] as string,
    restaurantName: r["restaurant_name"] as string,
    foodImageUrl: r["food_image_url"] as string | null,
    oldPrice: r["old_price"] as string,
    newPrice: r["new_price"] as string,
    tagline: r["tagline"] as string | null,
    resultUrl: r["result_url"] as string,
    templateId: (r["template_id"] as string | null) ?? "classic-red",
    createdAt: r["created_at"] as string,
  }));
  res.json(items);
});

export default router;

