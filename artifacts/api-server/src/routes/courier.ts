import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, ordersTable, orderItemsTable, orderItemOptionsTable, orderStatusHistoryTable, orderRatingsTable, courierSubscriptionsTable, courierSubscriptionPlansTable, courierCustomerRatingsTable, courierApplicationsTable, referralsTable, courierSubscriptionRequestsTable, systemSettingsTable, restaurantsTable, courierPointsTransactionsTable } from "@workspace/db";
import { and, eq, ne, inArray, notInArray, avg, count, sql, desc, getTableColumns } from "drizzle-orm";
import { haversineKm as _haversineKm } from "../lib/deliveryZones";
import { z } from "zod";
import { notifyOrderUpdate, sendOrderPush, notifyCouriersOrderTaken } from "../orders/server";
import { getLoyaltySettings, awardPointsInTx } from "../lib/loyalty";
import { awardCourierPointsInTx, getCourierPointValue, getCourierPointsPerDay, redeemCourierPointsForDays } from "../lib/courierPoints";
import { checkAndAwardAchievements } from "../lib/achievements";
import { awardReferralCommissionInTx } from "../lib/referral";
import { sendPushToUsers } from "../lib/push";

const router: IRouter = Router();

function resolveUserId(req: Request): string {
  return req.auth!.userId;
}

// Raw SQL (db.execute) can hand back timestamps as Postgres-format strings
// ("2026-06-24 21:00:00+00"). React Native's Hermes engine can only parse
// strict ISO, so it renders those as "Invalid Date". Normalize every date we
// send to the clients into an ISO string (Node parses the Postgres format fine).
function toIsoString(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
      .select({ name: usersTable.name, phone: usersTable.phone, role: usersTable.role, avatarUrl: usersTable.avatarUrl })
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
    avatarUrl: userRow[0]?.avatarUrl ?? null,
  });
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return _haversineKm(lat1, lon1, lat2, lon2);
}

router.post("/courier/register", (_req, res) => {
  res.status(410).json({ error: "Self-registration is disabled. Please submit a courier application via /api/courier/apply." });
});

const courierApplySchema = z.object({
  fullName: z.string().min(2),
  vehicleType: z.enum(["motorcycle", "car", "bicycle"]),
  vehiclePlate: z.string().default(""),
  idNumber: z.string().default(""),
  notes: z.string().default(""),
});

router.post("/courier/apply", async (req, res) => {
  const userId = resolveUserId(req);

  const body = courierApplySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid application data", details: body.error.issues });
    return;
  }

  const user = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user[0]?.role === "courier") {
    res.status(400).json({ error: "already_courier" });
    return;
  }

  const existing = await db
    .select({ id: courierApplicationsTable.id, status: courierApplicationsTable.status })
    .from(courierApplicationsTable)
    .where(and(
      eq(courierApplicationsTable.userId, userId),
      ne(courierApplicationsTable.status, "rejected"),
    ))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "application_exists", status: existing[0]!.status });
    return;
  }

  const id = crypto.randomUUID();
  const [app] = await db
    .insert(courierApplicationsTable)
    .values({
      id,
      userId,
      fullName: body.data.fullName,
      vehicleType: body.data.vehicleType,
      vehiclePlate: body.data.vehiclePlate,
      idNumber: body.data.idNumber,
      notes: body.data.notes,
    })
    .returning();

  res.status(201).json(app);
});

router.get("/courier/my-application", async (req, res) => {
  const userId = resolveUserId(req);

  const [app] = await db
    .select()
    .from(courierApplicationsTable)
    .where(eq(courierApplicationsTable.userId, userId))
    .orderBy(desc(courierApplicationsTable.createdAt))
    .limit(1);

  if (!app) {
    res.json(null);
    return;
  }

  res.json(app);
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

const MAX_SPEED_KMH = 150;
const MAX_SINGLE_JUMP_KM = 50;
const SERVICE_AREA_MAX_KM = 100;

// Proximity dispatch: a searching order is shown to every online courier, nearest
// restaurant first, but capped to this radius so a courier never sees an order across
// the city. An order or courier missing GPS is never hidden (shown, sorted last).
const MAX_VISIBLE_RADIUS_KM = 15;

router.patch("/courier/location", requireCourier, async (req, res) => {
  const body = locationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid location payload — lat and lon required" });
    return;
  }

  const courierId = resolveUserId(req);

  const current = await db
    .select({ courierLat: usersTable.courierLat, courierLon: usersTable.courierLon, courierLocationUpdatedAt: usersTable.courierLocationUpdatedAt })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

  const prev = current[0];
  const hasPriorLocation = prev?.courierLat !== null && prev?.courierLon !== null &&
    prev?.courierLocationUpdatedAt !== null &&
    prev?.courierLat !== undefined && prev?.courierLon !== undefined &&
    prev?.courierLocationUpdatedAt !== undefined;

  if (hasPriorLocation) {
    const elapsedHours = (Date.now() - prev!.courierLocationUpdatedAt!.getTime()) / 3_600_000;
    const distKm = haversineKm(prev!.courierLat!, prev!.courierLon!, body.data.lat, body.data.lon);
    if (distKm > MAX_SINGLE_JUMP_KM) {
      res.status(429).json({ error: "Location update rejected: distance jump too large" });
      return;
    }
    if (elapsedHours > 0 && distKm / elapsedHours > MAX_SPEED_KMH) {
      res.status(429).json({ error: "Location update rejected: movement speed exceeds physical limit" });
      return;
    }
  } else {
    const distFromCenter = haversineKm(DAMASCUS_LAT, DAMASCUS_LON, body.data.lat, body.data.lon);
    if (distFromCenter > SERVICE_AREA_MAX_KM) {
      res.status(400).json({ error: "Location is outside the service area" });
      return;
    }
  }

  await db
    .update(usersTable)
    .set({ courierLat: body.data.lat, courierLon: body.data.lon, courierLocationUpdatedAt: new Date() })
    .where(eq(usersTable.id, courierId));

  res.json({ ok: true });
});

const DAMASCUS_LAT = 33.5138;
const DAMASCUS_LON = 36.2765;

router.get("/courier/orders/available", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const courierUser = await db
    .select({
      isOnline: usersTable.isOnline,
      lat: usersTable.courierLat,
      lon: usersTable.courierLon,
    })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

  if (!courierUser[0]?.isOnline) {
    res.json([]);
    return;
  }

  const courierLat = courierUser[0]?.lat ?? null;
  const courierLon = courierUser[0]?.lon ?? null;

  const rows = await db
    .select({
      id: ordersTable.id,
      userId: ordersTable.userId,
      status: ordersTable.status,
      restaurantName: ordersTable.restaurantName,
      restaurantId: ordersTable.restaurantId,
      deliveryFee: ordersTable.deliveryFee,
      totalPrice: ordersTable.totalPrice,
      orderText: ordersTable.orderText,
      estimatedMinutes: ordersTable.estimatedMinutes,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
      orderType: ordersTable.orderType,
      placeName: ordersTable.placeName,
      restaurantLat: restaurantsTable.lat,
      restaurantLon: restaurantsTable.lon,
    })
    .from(ordersTable)
    .leftJoin(restaurantsTable, eq(ordersTable.restaurantId, restaurantsTable.id))
    .where(and(eq(ordersTable.status, "searching"), eq(ordersTable.courierId, "")))
    .orderBy(ordersTable.createdAt);

  const canMeasure = courierLat !== null && courierLon !== null;

  // Proximity dispatch (zones removed): every online courier sees every searching
  // order, sorted nearest-restaurant-first, with a soft radius cap. An order or
  // courier missing GPS is never hidden (shown, sorted last). First to accept wins.
  const matching = rows
    .filter((o) => o.userId !== courierId)
    .map((o) => {
      const distanceKm =
        canMeasure && o.restaurantLat !== null && o.restaurantLon !== null
          ? haversineKm(courierLat as number, courierLon as number, o.restaurantLat, o.restaurantLon)
          : null;
      return { o, distanceKm };
    })
    .filter(
      ({ o, distanceKm }) =>
        !o.restaurantId || distanceKm === null || distanceKm <= MAX_VISIBLE_RADIUS_KM,
    )
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    })
    .map(({ o, distanceKm }) => ({
      id: o.id,
      status: o.status,
      restaurantName: o.restaurantName,
      restaurantId: o.restaurantId,
      deliveryFee: o.deliveryFee,
      totalPrice: o.totalPrice,
      orderText: o.orderText,
      estimatedMinutes: o.estimatedMinutes,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      orderType: o.orderType,
      placeName: o.placeName,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
    }));

  res.json(matching);
});

const CUSTOMER_CONTACT_STATUSES: string[] = ["on_way", "delivered"];

router.get("/courier/orders/active", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const rows = await db
    .select({
      ...getTableColumns(ordersTable),
      customerName: usersTable.name,
      customerPhone: usersTable.phone,
      restaurantLat: restaurantsTable.lat,
      restaurantLon: restaurantsTable.lon,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(restaurantsTable, eq(ordersTable.restaurantId, restaurantsTable.id))
    .where(eq(ordersTable.courierId, courierId))
    .orderBy(ordersTable.updatedAt);

  const active = rows.filter((o) => o.status !== "delivered" && o.status !== "searching");

  // Fetch structured items + options for active orders
  const activeIds = active.map((o) => o.id);
  let itemsByOrderId = new Map<string, { id: string; nameAr: string; qty: number; unitPrice: number; lineTotal: number; note: string | null; options: { nameAr: string; extraPrice: number }[] }[]>();
  if (activeIds.length > 0) {
    const itemRows = await db
      .select({
        id: orderItemsTable.id,
        orderId: orderItemsTable.orderId,
        nameAr: orderItemsTable.nameAr,
        qty: orderItemsTable.qty,
        unitPrice: orderItemsTable.unitPrice,
        lineTotal: orderItemsTable.lineTotal,
        note: orderItemsTable.note,
        optNameAr: orderItemOptionsTable.nameAr,
        optExtraPrice: orderItemOptionsTable.extraPrice,
      })
      .from(orderItemsTable)
      .leftJoin(orderItemOptionsTable, eq(orderItemOptionsTable.orderItemId, orderItemsTable.id))
      .where(inArray(orderItemsTable.orderId, activeIds));

    type ItemAcc = { id: string; nameAr: string; qty: number; unitPrice: number; lineTotal: number; note: string | null; options: { nameAr: string; extraPrice: number }[] };
    const itemMap = new Map<string, Map<string, ItemAcc>>();
    for (const row of itemRows) {
      if (!itemMap.has(row.orderId)) itemMap.set(row.orderId, new Map());
      const orderItems = itemMap.get(row.orderId)!;
      if (!orderItems.has(row.id)) {
        orderItems.set(row.id, { id: row.id, nameAr: row.nameAr, qty: row.qty, unitPrice: row.unitPrice, lineTotal: row.lineTotal, note: row.note, options: [] });
      }
      if (row.optNameAr) {
        orderItems.get(row.id)!.options.push({ nameAr: row.optNameAr, extraPrice: row.optExtraPrice ?? 0 });
      }
    }
    for (const [orderId, orderItemMap] of itemMap.entries()) {
      itemsByOrderId.set(orderId, Array.from(orderItemMap.values()));
    }
  }

  const masked = active.map((o) => {
    const contactRevealed = CUSTOMER_CONTACT_STATUSES.includes(o.status);
    return {
      ...o,
      customerName: contactRevealed ? o.customerName : null,
      customerPhone: contactRevealed ? o.customerPhone : null,
      items: itemsByOrderId.get(o.id) ?? [],
    };
  });

  res.json(masked);
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
    .where(and(eq(ordersTable.courierId, courierId), notInArray(ordersTable.status, ["delivered", "cancelled"])))
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

  const [activeSub] = await db
    .select({ id: courierSubscriptionsTable.id })
    .from(courierSubscriptionsTable)
    .where(and(
      eq(courierSubscriptionsTable.courierId, courierId),
      eq(courierSubscriptionsTable.isActive, true),
      sql`${courierSubscriptionsTable.endsAt} > NOW()`,
    ))
    .limit(1);

  if (!activeSub) {
    res.status(403).json({ error: "subscription_expired", message: "اشتراكك منتهٍ. يرجى تجديد الاشتراك من صفحة الاشتراك." });
    return;
  }

  const courierName = courierUsers[0]?.name || "مندوب";
  const courierPhone = courierUsers[0]?.phone || "";

  const updated = await db
    .update(ordersTable)
    .set({ courierId, courierName, courierPhone, courierRating: 0, status: "accepted", updatedAt: new Date() })
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
  notifyCouriersOrderTaken(orderId);
  await sendOrderPush(order.userId, `${courierName} قبل طلبك وهو في الطريق لاستلامه!`, orderId);

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

  const updated = await db.transaction(async (tx) => {
    // Guard on current status inside the transaction so concurrent requests both
    // matching the pre-check cannot both win — only the first UPDATE succeeds.
    const rows = await tx
      .update(ordersTable)
      .set({ status: body.data.status, updatedAt: new Date() })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.courierId, courierId),
          eq(ordersTable.status, currentOrder.status)
        )
      )
      .returning();

    if (rows.length === 0) return [];

    await tx.insert(orderStatusHistoryTable).values({
      id: `${orderId}_${body.data.status}_${Date.now()}`,
      orderId,
      status: body.data.status,
    });

    if (body.data.status === "delivered") {
      const order = rows[0]!;
      const totalForPoints = order.totalPrice ?? order.deliveryFee;
      if (totalForPoints > 0) {
        try {
          const settings = await getLoyaltySettings();
          await awardPointsInTx(tx, currentOrder.userId, orderId, totalForPoints, settings);
        } catch {
          // points award failure must not block order completion
        }
      }
      // Reward the courier with points equal to the delivery-fee discount the
      // customer used on this order, so a customer promotion never costs the
      // courier income. Best-effort — never block completion.
      if (order.courierFeeDiscount > 0) {
        try {
          const pointValue = await getCourierPointValue();
          await awardCourierPointsInTx(tx, courierId, orderId, order.courierFeeDiscount, pointValue);
        } catch {
          // courier points award must not block order completion
        }
      }
      // Referral commission: award 5% of itemsTotal to referrer on FIRST delivered order only.
      // We filter status = 'pending' so a referral is only paid once even if the referred
      // user has multiple delivered orders in the future.
      if (order.totalPrice != null && order.totalPrice > 0) {
        try {
          const [pendingReferral] = await tx
            .select({ id: referralsTable.id, referrerId: referralsTable.referrerId })
            .from(referralsTable)
            .where(
              and(
                eq(referralsTable.referredUserId, currentOrder.userId),
                eq(referralsTable.status, "pending")
              )
            )
            .limit(1);
          if (pendingReferral && pendingReferral.referrerId !== currentOrder.userId) {
            const commission = await awardReferralCommissionInTx(tx, pendingReferral.id, pendingReferral.referrerId, orderId, order.totalPrice);
            if (commission > 0) {
              // Notify referrer after the transaction commits (non-blocking)
              const referrerId = pendingReferral.referrerId;
              const commissionAmt = commission;
              setImmediate(() => {
                void sendPushToUsers(
                  [referrerId],
                  `💰 حصلت على ${commissionAmt.toLocaleString()} ل.س عمولة إحالة!`,
                  "تهانينا! صديقك أكمل أول طلب بنجاح 🎉",
                  { type: "referral" }
                );
              });
            }
          }
        } catch {
          // referral commission failure must not block order completion
        }
      }
    }

    return rows;
  });

  if (updated.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  notifyOrderUpdate(currentOrder.userId, updated[0]);

  const pushMsg = STATUS_PUSH_MESSAGES[body.data.status] ?? "تم تحديث طلبك";
  await sendOrderPush(currentOrder.userId, pushMsg, orderId);

  if (body.data.status === "delivered") {
    void checkAndAwardAchievements(currentOrder.userId);
  }

  res.json(updated[0]);
});

const CANCEL_COOLDOWN_WINDOW_MINUTES = 60;
const CANCEL_COOLDOWN_MAX_CANCELS = 3;

router.post("/courier/orders/:orderId/cancel", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const windowStart = new Date(Date.now() - CANCEL_COOLDOWN_WINDOW_MINUTES * 60_000);
  const cancelNotePrefix = `courier_cancelled:${courierId}`;
  const recentCancels = await db
    .select({ id: orderStatusHistoryTable.id })
    .from(orderStatusHistoryTable)
    .where(
      and(
        sql`${orderStatusHistoryTable.note} LIKE ${cancelNotePrefix + "%"}`,
        sql`${orderStatusHistoryTable.createdAt} >= ${windowStart.toISOString()}`
      )
    )
    .limit(CANCEL_COOLDOWN_MAX_CANCELS);

  if (recentCancels.length >= CANCEL_COOLDOWN_MAX_CANCELS) {
    res.status(429).json({ error: "Too many cancellations. Please wait before cancelling again." });
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

  const order = orders[0];

  if (order.status === "delivered" || order.status === "picked_up" || order.status === "on_way") {
    res.status(409).json({ error: "Cannot cancel after pickup has occurred" });
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
    note: `courier_cancelled:${courierId}`,
  });

  notifyOrderUpdate(order.userId, { ...updated[0], cancelNote: "courier_cancelled" });
  await sendOrderPush(order.userId, "عذراً، المندوب ألغى الطلب. سيتم البحث عن مندوب آخر.", orderId);

  res.json({ success: true });
});

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

  const [aggResult, recentResult, todayAggResult] = await Promise.all([
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
  ]);

  const aggRow = aggResult.rows[0] as AggRow;
  const periodEarnings = Number(aggRow?.totalEarnings ?? 0);
  const periodDeliveriesCount = Number(aggRow?.totalCount ?? 0);

  const recentDeliveries = (recentResult.rows as RecentRow[]).map((row) => ({
    id: row.id,
    restaurantName: row.restaurantName,
    address: row.address,
    updatedAt: toIsoString(row.updatedAt),
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

  res.json({
    period: normalizedPeriod,
    periodEarnings,
    periodDeliveries: periodDeliveriesCount,
    todayEarnings,
    todayDeliveries: todayDeliveriesCount,
    recentDeliveries,
  });
});

router.get("/courier/subscription/today", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const today = new Date().toISOString().slice(0, 10);

  const [activeSub] = await db
    .select({ id: courierSubscriptionsTable.id, status: courierSubscriptionsTable.status })
    .from(courierSubscriptionsTable)
    .where(and(
      eq(courierSubscriptionsTable.courierId, courierId),
      eq(courierSubscriptionsTable.isActive, true),
      sql`${courierSubscriptionsTable.endsAt} > NOW()`,
    ))
    .orderBy(desc(courierSubscriptionsTable.endsAt))
    .limit(1);

  if (!activeSub) {
    res.json({ status: "no_subscription", amount: 0, date: today, isMonthlySubscriber: false });
    return;
  }

  res.json({ status: "paid", amount: 0, date: today, isMonthlySubscriber: true });
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
    .orderBy(desc(courierSubscriptionsTable.createdAt))
    .limit(60);
  res.json(rows);
});

router.get("/courier/subscription/status", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const now = new Date();

  const [activeSub] = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(and(
      eq(courierSubscriptionsTable.courierId, courierId),
      eq(courierSubscriptionsTable.isActive, true),
      sql`${courierSubscriptionsTable.endsAt} > NOW()`,
    ))
    .orderBy(desc(courierSubscriptionsTable.endsAt))
    .limit(1);

  if (!activeSub) {
    res.json({ isActive: false, subscription: null });
    return;
  }

  const daysLeft = Math.max(0, Math.ceil((activeSub.endsAt.getTime() - now.getTime()) / 86_400_000));

  res.json({ isActive: true, subscription: activeSub, daysLeft });
});

router.get("/courier/subscription-plans", requireCourier, async (_req, res) => {
  const plans = await db
    .select()
    .from(courierSubscriptionPlansTable)
    .where(eq(courierSubscriptionPlansTable.isActive, true))
    .orderBy(courierSubscriptionPlansTable.sortOrder, courierSubscriptionPlansTable.price);
  res.json(plans);
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
    updatedAt: toIsoString(r.updatedAt),
    createdAt: toIsoString(r.createdAt),
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
    createdAt: toIsoString(r.createdAt),
  }));

  const avgStars = rows.length > 0
    ? rows.reduce((s, r) => s + r.stars, 0) / rows.length
    : null;

  res.json({ ratings: rows, avgStars: avgStars ? Number(avgStars.toFixed(2)) : null, total: rows.length });
});

const updateCourierProfileSchema = z.object({
  name: z.string().min(1).max(60).trim().optional(),
  phone: z.string().min(7).max(20).optional(),
  avatarUrl: z.string().max(1024).nullable().optional(),
});

router.patch("/courier/profile", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const body = updateCourierProfileSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "بيانات غير صالحة", details: body.error.issues });
    return;
  }

  const updates: Partial<{ name: string; phone: string; avatarUrl: string | null }> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.phone !== undefined) {
    const existingWithPhone = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, body.data.phone))
      .limit(1);
    if (existingWithPhone.length > 0 && existingWithPhone[0].id !== courierId) {
      res.status(409).json({ error: "رقم الهاتف مستخدم من قِبَل حساب آخر" });
      return;
    }
    updates.phone = body.data.phone;
  }
  if (body.data.avatarUrl !== undefined) updates.avatarUrl = body.data.avatarUrl;

  if (Object.keys(updates).length === 0) {
    const existing = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, courierId)).limit(1);
    if (existing.length === 0) { res.status(404).json({ error: "Courier not found" }); return; }
    res.json(existing[0]);
    return;
  }

  const rows = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, courierId))
    .returning({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl });

  if (rows.length === 0) {
    res.status(404).json({ error: "Courier not found" });
    return;
  }

  res.json(rows[0]);
});

const subscriptionRequestSchema = z.object({
  planId: z.string().min(1),
  paidAmount: z.number().int().positive(),
  receiptUrl: z.string().optional(),
});

router.post("/courier/subscription/request", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const body = subscriptionRequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid payload", details: body.error.issues });
    return;
  }

  const [activeSub] = await db
    .select({ id: courierSubscriptionsTable.id })
    .from(courierSubscriptionsTable)
    .where(and(
      eq(courierSubscriptionsTable.courierId, courierId),
      eq(courierSubscriptionsTable.isActive, true),
      sql`${courierSubscriptionsTable.endsAt} > NOW()`,
    ))
    .limit(1);

  if (activeSub) {
    res.status(409).json({ error: "already_subscribed", message: "لديك اشتراك نشط بالفعل." });
    return;
  }

  const [existing] = await db
    .select({ id: courierSubscriptionRequestsTable.id, status: courierSubscriptionRequestsTable.status })
    .from(courierSubscriptionRequestsTable)
    .where(and(
      eq(courierSubscriptionRequestsTable.courierId, courierId),
      eq(courierSubscriptionRequestsTable.status, "pending"),
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "request_pending", message: "لديك طلب اشتراك قيد المراجعة بالفعل." });
    return;
  }

  const [plan] = await db
    .select()
    .from(courierSubscriptionPlansTable)
    .where(and(
      eq(courierSubscriptionPlansTable.id, body.data.planId),
      eq(courierSubscriptionPlansTable.isActive, true),
    ))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "plan_not_found", message: "الباقة غير موجودة أو غير متاحة." });
    return;
  }

  const id = crypto.randomUUID();

  const [created] = await db
    .insert(courierSubscriptionRequestsTable)
    .values({
      id,
      courierId,
      planId: plan.id,
      planName: plan.name,
      planPeriod: plan.period,
      planPrice: plan.price,
      paidAmount: body.data.paidAmount,
      receiptUrl: body.data.receiptUrl ?? null,
      status: "pending",
    })
    .returning();

  res.status(201).json(created);
});

router.get("/courier/subscription/request/status", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const [latest] = await db
    .select()
    .from(courierSubscriptionRequestsTable)
    .where(eq(courierSubscriptionRequestsTable.courierId, courierId))
    .orderBy(desc(courierSubscriptionRequestsTable.createdAt))
    .limit(1);

  res.json(latest ?? null);
});

router.get("/courier/subscription/request/history", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const rows = await db
    .select()
    .from(courierSubscriptionRequestsTable)
    .where(eq(courierSubscriptionRequestsTable.courierId, courierId))
    .orderBy(desc(courierSubscriptionRequestsTable.createdAt))
    .limit(60);

  res.json(rows);
});

router.delete("/courier/subscription/request", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);

  const [pending] = await db
    .select()
    .from(courierSubscriptionRequestsTable)
    .where(and(
      eq(courierSubscriptionRequestsTable.courierId, courierId),
      eq(courierSubscriptionRequestsTable.status, "pending"),
    ))
    .orderBy(desc(courierSubscriptionRequestsTable.createdAt))
    .limit(1);

  if (!pending) {
    res.status(404).json({ error: "No pending request found" });
    return;
  }

  const ageMs = Date.now() - new Date(pending.createdAt).getTime();
  const tenMinutes = 10 * 60 * 1000;
  if (ageMs < tenMinutes) {
    const remainingMs = tenMinutes - ageMs;
    const remainingMin = Math.ceil(remainingMs / 60_000);
    res.status(409).json({
      error: "too_soon",
      message: `يمكنك إلغاء الطلب بعد ${remainingMin} دقيقة`,
      remainingMs,
    });
    return;
  }

  await db
    .update(courierSubscriptionRequestsTable)
    .set({ status: "cancelled" })
    .where(eq(courierSubscriptionRequestsTable.id, pending.id));

  res.json({ ok: true });
});

router.get("/courier/payment-qr", async (_req, res) => {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "payment_qr_url"));
  const url = rows[0]?.value ?? null;
  res.json({ url });
});

// Courier reward points: balance + redeem for subscription days.
router.get("/courier/points", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const [userRow, conv, txs] = await Promise.all([
    db.select({ courierPoints: usersTable.courierPoints }).from(usersTable).where(eq(usersTable.id, courierId)).limit(1),
    getCourierPointsPerDay(),
    db
      .select()
      .from(courierPointsTransactionsTable)
      .where(eq(courierPointsTransactionsTable.courierId, courierId))
      .orderBy(desc(courierPointsTransactionsTable.createdAt))
      .limit(50),
  ]);
  const balance = userRow[0]?.courierPoints ?? 0;
  res.json({
    balance,
    pointsPerDay: conv.pointsPerDay,
    pointValue: conv.pointValue,
    redeemableDays: conv.pointsPerDay > 0 ? Math.floor(balance / conv.pointsPerDay) : 0,
    transactions: txs.map((t) => ({
      id: t.id,
      type: t.type,
      points: t.points,
      orderId: t.orderId,
      description: t.description,
      createdAt: toIsoString(t.createdAt),
    })),
  });
});

const redeemPointsSchema = z.object({ days: z.number().int().positive().max(365) });

router.post("/courier/points/redeem", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const body = redeemPointsSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_days" });
    return;
  }
  const result = await redeemCourierPointsForDays(courierId, body.data.days);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({
    ok: true,
    daysAdded: result.daysAdded,
    pointsSpent: result.pointsSpent,
    newBalance: result.newBalance,
    newEndsAt: result.newEndsAt.toISOString(),
  });
});

export default router;
