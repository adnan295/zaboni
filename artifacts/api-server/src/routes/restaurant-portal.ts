import { Router, type Request, type Response, type NextFunction } from "express";
import { db, restaurantUsersTable, restaurantsTable, menuItemsTable, restaurantHoursTable, ordersTable, otpCodesTable } from "@workspace/db";
import { eq, desc, and, gte, count, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";

const router = Router();

function getJwtSecret(): string {
  return process.env["JWT_SECRET"] ?? "fallback-secret";
}

interface RestaurantPortalPayload {
  restaurantUserId: string;
  restaurantId: string;
  phone: string;
}

function requireRestaurantAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as RestaurantPortalPayload;
    if (!payload.restaurantId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    (req as Request & { restaurantAuth?: RestaurantPortalPayload }).restaurantAuth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function getRestaurantAuth(req: Request): RestaurantPortalPayload {
  return (req as Request & { restaurantAuth?: RestaurantPortalPayload }).restaurantAuth!;
}

function issueToken(payload: RestaurantPortalPayload): string {
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
  const token = issueToken({ restaurantUserId: user.id, restaurantId: user.restaurantId, phone: user.phone });
  res.json({ token, restaurant, authMode: user.authMode });
});

router.post("/restaurant-portal/auth/request-otp", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "رقم الهاتف مطلوب" }); return; }

  const [user] = await db.select().from(restaurantUsersTable).where(eq(restaurantUsersTable.phone, parsed.data.phone)).limit(1);
  if (!user || !user.isActive) { res.status(404).json({ error: "لا يوجد حساب بهذا الرقم" }); return; }
  if (user.authMode !== "otp") { res.status(400).json({ error: "هذا الحساب يستخدم كلمة المرور للدخول" }); return; }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const otpId = `rotp_${Date.now()}`;
  await db.insert(otpCodesTable).values({ id: otpId, phone: parsed.data.phone, code, expiresAt });

  const devCode = process.env["NODE_ENV"] !== "production" ? code : undefined;
  res.json({ ok: true, devCode });
});

router.post("/restaurant-portal/auth/verify-otp", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(1), code: z.string().min(4) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }

  const [user] = await db.select().from(restaurantUsersTable).where(eq(restaurantUsersTable.phone, parsed.data.phone)).limit(1);
  if (!user || !user.isActive) { res.status(404).json({ error: "لا يوجد حساب بهذا الرقم" }); return; }

  const now = new Date();
  const [otp] = await db.select().from(otpCodesTable)
    .where(and(eq(otpCodesTable.phone, parsed.data.phone), eq(otpCodesTable.used, false), eq(otpCodesTable.code, parsed.data.code)))
    .orderBy(desc(otpCodesTable.createdAt)).limit(1);

  if (!otp || otp.expiresAt < now) { res.status(401).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" }); return; }
  await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otp.id));

  const [restaurant] = await db.select({ id: restaurantsTable.id, nameAr: restaurantsTable.nameAr, name: restaurantsTable.name, image: restaurantsTable.image }).from(restaurantsTable).where(eq(restaurantsTable.id, user.restaurantId)).limit(1);
  const token = issueToken({ restaurantUserId: user.id, restaurantId: user.restaurantId, phone: user.phone });
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
  const [restaurant] = await db.select({ name: restaurantsTable.name, nameAr: restaurantsTable.nameAr }).from(restaurantsTable).where(eq(restaurantsTable.id, restaurantId)).limit(1);
  if (!restaurant) { res.json([]); return; }

  const limit = Math.min(parseInt(String(req.query["limit"] ?? "50")), 100);
  const orders = await db.select().from(ordersTable)
    .where(sql`${ordersTable.restaurantName} = ${restaurant.nameAr} OR ${ordersTable.restaurantName} = ${restaurant.name}`)
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);
  res.json(orders);
});

router.get("/restaurant-portal/stats", requireRestaurantAuth, async (req, res) => {
  const { restaurantId } = getRestaurantAuth(req);
  const [restaurant] = await db.select({ name: restaurantsTable.name, nameAr: restaurantsTable.nameAr, rating: restaurantsTable.rating, isOpen: restaurantsTable.isOpen }).from(restaurantsTable).where(eq(restaurantsTable.id, restaurantId)).limit(1);
  if (!restaurant) { res.json({}); return; }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [allOrders, todayOrders, menuCount] = await Promise.all([
    db.select({ count: count() }).from(ordersTable).where(sql`${ordersTable.restaurantName} = ${restaurant.nameAr} OR ${ordersTable.restaurantName} = ${restaurant.name}`),
    db.select({ count: count(), deliveredCount: sql<number>`COUNT(*) FILTER (WHERE status = 'delivered')` }).from(ordersTable).where(and(sql`${ordersTable.restaurantName} = ${restaurant.nameAr} OR ${ordersTable.restaurantName} = ${restaurant.name}`, gte(ordersTable.createdAt, todayStart))),
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
