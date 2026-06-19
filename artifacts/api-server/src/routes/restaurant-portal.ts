import { Router, type Request, type Response, type NextFunction } from "express";
import { db, restaurantUsersTable, restaurantsTable, menuItemsTable, restaurantHoursTable, ordersTable, otpCodesTable, orderRatingsTable, promoCodesTable, promoUsesTable } from "@workspace/db";
import { eq, desc, and, gte, count, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendSmsViaGateway } from "../lib/sms";
import { whatsappManager } from "../lib/whatsapp";
import OpenAI, { toFile } from "openai";
import { objectStorageClient } from "../lib/objectStorage";
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

function getOpenAIClient(): OpenAI {
  if (!process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] || !process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]) {
    throw new Error("OpenAI integration not configured");
  }
  return new OpenAI({
    apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
    baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  });
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
    nameAr: "كلاسيكي أحمر",
    description: "أسلوب المطاعم العالمية — أحمر وأبيض بخط عريض",
    swatch: "🔴",
    buildPrompt: (name, old, now, tagline) =>
      `Create a professional promotional food advertisement banner in bold RED and WHITE color scheme, fast-food chain style (like KFC or Burger King). Square 1:1 format.
Layout: Top section — deep red banner with the restaurant name "${name}" in large bold white Arabic text. Center — food item displayed large and appetizingly. Bottom — price burst shape: old price "${old}" in white with a diagonal strikethrough line, new discounted price "${now}" in a bright yellow starburst badge with large bold Arabic numerals.${tagline ? ` Slogan "${tagline}" in white Arabic text on red ribbon.` : ""}
Typography: Bold condensed Arabic font throughout. High contrast white on red and red on white.
Visual style: Glossy, vibrant, fast-food marketing quality. Rich red (#CC0000), white, and yellow (#FFD700) accents. All visible text must be in Arabic script. Professional social-media-ready advertisement.`,
  },
  {
    id: "dark-luxury",
    nameAr: "داكن فاخر",
    description: "أسود وذهبي — مطاعم فاخرة وراقية",
    swatch: "🖤",
    buildPrompt: (name, old, now, tagline) =>
      `Create a premium luxury food promotional banner in deep BLACK and GOLD color scheme. Square 1:1 format.
Layout: Dark charcoal/black background. Top — ornate gold decorative border with restaurant name "${name}" in elegant gold Arabic calligraphy. Center — food item beautifully lit on dark surface, styled like a fine-dining photograph. Bottom — elegant price display: old price "${old}" in muted gray Arabic text with a thin gold strikethrough, new price "${now}" in large shimmering gold Arabic numerals inside a gold-bordered rectangle.${tagline ? ` Tagline "${tagline}" in small gold italic Arabic text.` : ""}
Typography: Refined serif Arabic font. Restrained, luxurious spacing.
Visual style: Moody, high-end restaurant photography aesthetic. Colors: #1A1A1A background, #C9A84C gold, #FFFFFF white accents. All visible text must be in Arabic script. Premium social-media advertisement quality.`,
  },
  {
    id: "fresh-green",
    nameAr: "أخضر طازج",
    description: "أخضر وأبيض — أكل صحي وطازج",
    swatch: "🟢",
    buildPrompt: (name, old, now, tagline) =>
      `Create a fresh, healthy food promotional banner in vibrant GREEN and WHITE color scheme. Square 1:1 format.
Layout: Fresh white background with lush green accents. Top — leaf-green header band with restaurant name "${name}" in crisp white Arabic text. Center — food item surrounded by fresh herbs, vegetables or natural elements for a healthy feel. Bottom — price tag styled like a green label: old price "${old}" in gray Arabic text with strikethrough, new price "${now}" in bold white Arabic numerals on a green rounded badge.${tagline ? ` Tagline "${tagline}" in green Arabic text on white ribbon.` : ""}
Typography: Clean modern Arabic font. Airy, natural spacing.
Visual style: Organic, fresh, health-food market quality. Colors: #2E7D32 deep green, #81C784 light green, pure white, #F9FBF5 off-white background. All visible text must be in Arabic script. Natural and appetizing social-media advertisement.`,
  },
  {
    id: "bold-orange",
    nameAr: "برتقالي جريء",
    description: "برتقالي وأصفر — أكل شعبي وسريع",
    swatch: "🟠",
    buildPrompt: (name, old, now, tagline) =>
      `Create an energetic, eye-catching food promotional banner in warm ORANGE and YELLOW color scheme. Square 1:1 format.
Layout: Vibrant orange-to-yellow gradient background. Top — bold white Arabic text of restaurant name "${name}" with a dark orange drop shadow on a curved banner ribbon. Center — food item displayed prominently with warm lighting and steam effects for street-food energy. Bottom — dynamic price section: old price "${old}" in white Arabic text with a bold strikethrough, new price "${now}" in large black Arabic numerals on a bright yellow starburst.${tagline ? ` Slogan "${tagline}" in bold Arabic on orange banner.` : ""}
Typography: Heavy display Arabic font, punchy and bold.
Visual style: Street food festival energy, warm and inviting. Colors: #E65100 deep orange, #FF9800 orange, #FFD600 yellow, white. All visible text must be in Arabic script. Bold and exciting social-media advertisement.`,
  },
  {
    id: "clean-white",
    nameAr: "أبيض أنيق",
    description: "بسيط وعصري — كافيهات ومطاعم أنيقة",
    swatch: "⬜",
    buildPrompt: (name, old, now, tagline) =>
      `Create a minimal, elegant food promotional banner in a clean WHITE and GRAY color scheme with a single accent color. Square 1:1 format.
Layout: Pure white background with subtle light gray geometric borders. Top — thin gray separator line with restaurant name "${name}" in small refined dark Arabic text. Center — food item photographed in a clean, minimal style with plenty of white space. Bottom — typographic price display: old price "${old}" in small light gray Arabic text with a thin strikethrough, new price "${now}" in large dark Arabic numerals with a terracotta or dusty-rose accent badge.${tagline ? ` Tagline "${tagline}" in light gray Arabic text, centered below price.` : ""}
Typography: Light-weight modern Arabic sans-serif. Generous whitespace.
Visual style: Modern café, editorial minimalism. Colors: #FFFFFF white, #F5F5F5 light gray, #212121 near-black, #B85C38 terracotta accent. All visible text must be in Arabic script. Sophisticated and premium-feeling social-media advertisement.`,
  },
  {
    id: "deep-blue",
    nameAr: "أزرق غامق",
    description: "كحلي وأبيض — مأكولات بحرية ومطاعم رسمية",
    swatch: "🔵",
    buildPrompt: (name, old, now, tagline) =>
      `Create a formal, trustworthy food promotional banner in deep NAVY BLUE and WHITE color scheme. Square 1:1 format.
Layout: Deep navy blue background (#0D2137) with subtle wave or geometric pattern overlay. Top — restaurant name "${name}" in large clean white Arabic text on a navy header band with a thin gold accent line. Center — food item elegantly presented, styled for a formal dining or seafood restaurant atmosphere. Bottom — price display in a clean white card-style panel: old price "${old}" in gray Arabic strikethrough text, new price "${now}" in bold navy Arabic numerals on a white rounded rectangle badge.${tagline ? ` Tagline "${tagline}" in white Arabic text on navy ribbon.` : ""}
Typography: Structured, professional Arabic font. Formal and readable.
Visual style: Fine-dining or seafood restaurant prestige. Colors: #0D2137 navy, #1565C0 medium blue, #FFFFFF white, #C9A84C gold trim. All visible text must be in Arabic script. Authoritative and elegant social-media advertisement.`,
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

  let openai: OpenAI;
  try { openai = getOpenAIClient(); } catch { res.status(503).json({ error: "خدمة توليد الصور غير متاحة حالياً" }); return; }

  const prompt = template.buildPrompt(restaurantName, oldPrice, newPrice, tagline);

  try {
    let base64Data: string;

    if (foodObjectPath) {
      const { buffer: imgBuffer, contentType } = await readFoodImageFromStorage(foodObjectPath);
      const ext = contentType.includes("png") ? "png" : "jpeg";
      const imgFile = await toFile(imgBuffer, `food.${ext}`, { type: contentType });

      const editResult = await openai.images.edit({
        model: "gpt-image-1",
        image: imgFile,
        prompt,
        size: "1024x1024",
      });
      base64Data = (editResult.data ?? [])[0]?.b64_json ?? "";
    } else {
      const genResult = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
      });
      base64Data = (genResult.data ?? [])[0]?.b64_json ?? "";
    }

    if (!base64Data) throw new Error("لم يتم إنشاء الصورة");

    const bannerBuffer = Buffer.from(base64Data, "base64");
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

