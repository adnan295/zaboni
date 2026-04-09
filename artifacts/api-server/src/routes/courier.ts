import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, ordersTable, orderStatusHistoryTable, orderRatingsTable } from "@workspace/db";
import { and, eq, ne, avg, count, sql } from "drizzle-orm";
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
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

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

export default router;
