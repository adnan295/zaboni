import { Router, type Request, type Response, type NextFunction } from "express";
import { db, restaurantUsersTable, restaurantsTable, menuItemsTable, restaurantHoursTable, ordersTable, otpCodesTable } from "@workspace/db";
import { eq, desc, and, gte, count, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendSmsViaGateway } from "../lib/sms";
import { whatsappManager } from "../lib/whatsapp";

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

export default router;
