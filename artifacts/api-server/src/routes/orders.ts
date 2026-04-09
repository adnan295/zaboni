import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, orderStatusHistoryTable, orderRatingsTable, restaurantsTable, promoCodesTable, promoUsesTable, usersTable } from "@workspace/db";
import { and, count, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { notifyOrderUpdate, notifyNearbyCouriers } from "../orders/server";
import { haversineKm, getFeeForDistance, DEFAULT_DELIVERY_FEE_SYP, DAMASCUS_CENTER_LAT, DAMASCUS_CENTER_LON } from "../lib/deliveryZones";

const router: IRouter = Router();

const createOrderSchema = z.object({
  orderText: z.string().min(1),
  restaurantName: z.string().default(""),
  address: z.string().default(""),
  promoCode: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  restaurantId: z.string().optional(),
});

async function validatePromoForUser(code: string, userId: string, deliveryFee?: number): Promise<{
  valid: false; error: string;
} | {
  valid: true;
  promo: typeof promoCodesTable.$inferSelect;
  discountAmount: number;
}> {
  const now = new Date();
  const promos = await db
    .select()
    .from(promoCodesTable)
    .where(and(
      eq(promoCodesTable.code, code.toUpperCase()),
      eq(promoCodesTable.isActive, true),
    ))
    .limit(1);

  if (promos.length === 0) return { valid: false, error: "invalid" };
  const promo = promos[0]!;
  if (promo.expiresAt && promo.expiresAt < now) return { valid: false, error: "expired" };

  const [globalUseRow] = await db
    .select({ c: count() })
    .from(promoUsesTable)
    .where(eq(promoUsesTable.promoId, promo.id));
  const globalUses = Number(globalUseRow?.c ?? 0);
  if (promo.maxUses != null && globalUses >= promo.maxUses) return { valid: false, error: "exhausted" };

  const [userUseRow] = await db
    .select({ c: count() })
    .from(promoUsesTable)
    .where(and(eq(promoUsesTable.promoId, promo.id), eq(promoUsesTable.userId, userId)));
  const userUses = Number(userUseRow?.c ?? 0);
  if (userUses >= promo.maxUsesPerUser) return { valid: false, error: "already_used" };

  const base = deliveryFee ?? DEFAULT_DELIVERY_FEE_SYP;
  const discountAmount = promo.type === "percent"
    ? Math.min(Math.round((base * promo.value) / 100), base)
    : Math.min(promo.value, base);

  return { valid: true, promo, discountAmount };
}

router.get("/delivery-fee-preview", async (req, res) => {
  const latRaw = parseFloat(String(req.query["lat"] ?? ""));
  const lonRaw = parseFloat(String(req.query["lon"] ?? ""));
  const restaurantId = String(req.query["restaurantId"] ?? "");

  if (isNaN(latRaw) || isNaN(lonRaw)) {
    res.status(400).json({ error: "lat and lon query params required" });
    return;
  }

  let originLat = DAMASCUS_CENTER_LAT;
  let originLon = DAMASCUS_CENTER_LON;

  if (restaurantId) {
    const restaurant = await db
      .select({ lat: restaurantsTable.lat, lon: restaurantsTable.lon })
      .from(restaurantsTable)
      .where(eq(restaurantsTable.id, restaurantId))
      .limit(1);
    const r = restaurant[0];
    if (r?.lat != null && r?.lon != null) {
      originLat = r.lat;
      originLon = r.lon;
    }
  }

  const distanceKm = haversineKm(originLat, originLon, latRaw, lonRaw);
  const { fee, zone } = await getFeeForDistance(distanceKm);

  res.json({
    fee,
    distanceKm: Number(distanceKm.toFixed(2)),
    zoneLabel: zone?.label ?? null,
    fromKm: zone?.fromKm ?? null,
    toKm: zone?.toKm ?? null,
  });
});

function resolveUserId(req: Request): string {
  return req.auth!.userId;
}

router.get("/orders", async (req, res) => {
  const userId = resolveUserId(req);
  const pageRaw = parseInt(String(req.query["page"] ?? "1"));
  const limitRaw = parseInt(String(req.query["limit"] ?? "20"));
  const page = Math.max(1, isNaN(pageRaw) ? 1 : pageRaw);
  const limit = Math.min(50, Math.max(1, isNaN(limitRaw) ? 20 : limitRaw));
  const offset = (page - 1) * limit;

  const [allRows, countRows] = await Promise.all([
    db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId)),
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  const hasMore = offset + allRows.length < total;
  res.json({ orders: allRows, total, hasMore, page, limit });
});

router.post("/orders/validate-promo", async (req, res) => {
  const userId = resolveUserId(req);
  const body = z.object({
    code: z.string().min(1),
    deliveryFee: z.number().positive().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    restaurantId: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "code required" });
    return;
  }
  let feeForPromo = body.data.deliveryFee;
  if (!feeForPromo && body.data.lat != null && body.data.lon != null) {
    let originLat = DAMASCUS_CENTER_LAT;
    let originLon = DAMASCUS_CENTER_LON;
    if (body.data.restaurantId) {
      const [r] = await db
        .select({ lat: restaurantsTable.lat, lon: restaurantsTable.lon })
        .from(restaurantsTable)
        .where(eq(restaurantsTable.id, body.data.restaurantId))
        .limit(1);
      if (r?.lat != null && r?.lon != null) {
        originLat = r.lat;
        originLon = r.lon;
      }
    }
    const distKm = haversineKm(originLat, originLon, body.data.lat, body.data.lon);
    const { fee } = await getFeeForDistance(distKm);
    feeForPromo = fee;
  }
  const result = await validatePromoForUser(body.data.code, userId, feeForPromo);
  if (!result.valid) {
    res.status(422).json({ valid: false, error: result.error });
    return;
  }
  res.json({
    valid: true,
    type: result.promo.type,
    value: result.promo.value,
    discountAmount: result.discountAmount,
    code: result.promo.code,
  });
});

router.post("/orders", async (req, res) => {
  const body = createOrderSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const userId = resolveUserId(req);
  const id = `${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
  const estimatedMinutes = Math.floor(Math.random() * 15) + 30;

  const destLat = body.data.lat ?? DAMASCUS_CENTER_LAT;
  const destLon = body.data.lon ?? DAMASCUS_CENTER_LON;

  let originLat = DAMASCUS_CENTER_LAT;
  let originLon = DAMASCUS_CENTER_LON;
  if (body.data.restaurantId) {
    const restaurant = await db
      .select({ lat: restaurantsTable.lat, lon: restaurantsTable.lon })
      .from(restaurantsTable)
      .where(eq(restaurantsTable.id, body.data.restaurantId))
      .limit(1);
    const r = restaurant[0];
    if (r?.lat != null && r?.lon != null) {
      originLat = r.lat;
      originLon = r.lon;
    }
  }

  const distanceKm = haversineKm(originLat, originLon, destLat, destLon);
  const { fee: zoneFee } = await getFeeForDistance(distanceKm);

  let promoUseData: { promoId: string; discountAmount: number } | null = null;
  if (body.data.promoCode) {
    const promoResult = await validatePromoForUser(body.data.promoCode, userId, zoneFee);
    if (!promoResult.valid) {
      res.status(422).json({ error: "invalid_promo", reason: promoResult.error });
      return;
    }
    promoUseData = { promoId: promoResult.promo.id, discountAmount: promoResult.discountAmount };
  }

  const newOrder = {
    id,
    userId,
    orderText: body.data.orderText,
    restaurantName: body.data.restaurantName,
    status: "searching" as const,
    courierName: "",
    courierPhone: "",
    courierRating: 0,
    courierId: "",
    address: body.data.address,
    destinationLat: destLat,
    destinationLon: destLon,
    deliveryFee: zoneFee,
    estimatedMinutes,
  };

  const rows = await db.insert(ordersTable).values(newOrder).returning();

  await db.insert(orderStatusHistoryTable).values({
    id: `${id}_searching`,
    orderId: id,
    status: "searching",
  });

  if (promoUseData) {
    await db.insert(promoUsesTable).values({
      id: `pu_${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      promoId: promoUseData.promoId,
      userId,
      orderId: id,
      discountAmount: promoUseData.discountAmount,
    });
  }

  void notifyNearbyCouriers(destLat, destLon, body.data.restaurantName, zoneFee);

  res.status(201).json({ ...rows[0], appliedPromo: promoUseData ? true : false });
});

router.get("/orders/ratings", async (req, res) => {
  const userId = resolveUserId(req);
  const rows = await db
    .select()
    .from(orderRatingsTable)
    .where(eq(orderRatingsTable.userId, userId))
    .orderBy(orderRatingsTable.createdAt);
  res.json(rows);
});

router.get("/orders/:id", async (req, res) => {
  const userId = resolveUserId(req);
  const { id } = req.params;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)));
  if (rows.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(rows[0]);
});

router.get("/orders/:id/courier-location", async (req, res) => {
  const userId = resolveUserId(req);
  const { id } = req.params;

  const orders = await db
    .select({ courierId: ordersTable.courierId, status: ordersTable.status })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)))
    .limit(1);

  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const order = orders[0]!;
  if (!order.courierId) {
    res.status(404).json({ error: "No courier assigned yet" });
    return;
  }

  const couriers = await db
    .select({
      courierLat: usersTable.courierLat,
      courierLon: usersTable.courierLon,
      courierLocationUpdatedAt: usersTable.courierLocationUpdatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, order.courierId))
    .limit(1);

  const courier = couriers[0];
  if (!courier || courier.courierLat == null || courier.courierLon == null) {
    res.status(404).json({ error: "Courier location not available" });
    return;
  }

  res.json({
    lat: courier.courierLat,
    lon: courier.courierLon,
    updatedAt: courier.courierLocationUpdatedAt?.toISOString() ?? new Date().toISOString(),
  });
});

router.delete("/orders/:id", async (req, res) => {
  const userId = resolveUserId(req);
  const { id } = req.params;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)));
  if (rows.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const order = rows[0]!;
  if (order.status !== "searching") {
    res.status(409).json({ error: "Order can only be cancelled while searching for a courier" });
    return;
  }
  const updated = await db
    .update(ordersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId), eq(ordersTable.status, "searching")))
    .returning();
  if (updated.length === 0) {
    res.status(409).json({ error: "Order status changed, cannot cancel" });
    return;
  }
  await db.insert(orderStatusHistoryTable).values({
    id: `${id}_cancelled_${Date.now()}`,
    orderId: id,
    status: "cancelled",
  });
  notifyOrderUpdate(userId, updated[0]);
  res.json(updated[0]);
});

const rateOrderSchema = z.object({
  restaurantStars: z.number().int().min(1).max(5),
  courierStars: z.number().int().min(1).max(5),
  comment: z.string().max(500).default(""),
  restaurantName: z.string().default(""),
});

router.post("/orders/:id/rate", async (req, res) => {
  const userId = resolveUserId(req);
  const orderId = String(req.params["id"]);

  const order = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)));
  if (order.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order[0]!.status !== "delivered") {
    res.status(400).json({ error: "Order not yet delivered" });
    return;
  }

  const existing = await db
    .select()
    .from(orderRatingsTable)
    .where(and(eq(orderRatingsTable.orderId, orderId), eq(orderRatingsTable.userId, userId)));
  if (existing.length > 0) {
    res.status(409).json({ error: "Already rated" });
    return;
  }

  const body = rateOrderSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const o = order[0]!;
  const restaurantName = o.restaurantName || body.data.restaurantName;

  let restaurantId: string | null = null;
  if (restaurantName) {
    const found = await db
      .select({ id: restaurantsTable.id })
      .from(restaurantsTable)
      .where(
        or(
          eq(restaurantsTable.name, restaurantName),
          eq(restaurantsTable.nameAr, restaurantName),
        ),
      )
      .limit(1);
    restaurantId = found[0]?.id ?? null;
  }

  const ratingId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const rows = await db
    .insert(orderRatingsTable)
    .values({
      id: ratingId,
      orderId,
      userId,
      courierId: o.courierId,
      restaurantId,
      restaurantStars: body.data.restaurantStars,
      courierStars: body.data.courierStars,
      comment: body.data.comment,
      restaurantName,
    })
    .returning();

  res.status(201).json(rows[0]);
});

export default router;
