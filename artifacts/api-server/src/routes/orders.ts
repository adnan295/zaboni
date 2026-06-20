import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, orderItemsTable, menuItemsTable, orderStatusHistoryTable, orderRatingsTable, restaurantsTable, promoCodesTable, promoUsesTable, usersTable, flashDealsTable, loyaltyTransactionsTable } from "@workspace/db";
import { and, count, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { notifyOrderUpdate, notifyNearbyCouriers, notifyRestaurantNewOrder } from "../orders/server";
import { haversineKm, getFeeForDistance, DEFAULT_DELIVERY_FEE_SYP, DAMASCUS_CENTER_LAT, DAMASCUS_CENTER_LON } from "../lib/deliveryZones";
import { getLoyaltySettings, calculateRedeemDiscount, redeemLoyaltyPoints } from "../lib/loyalty";
import { checkAndAwardAchievements } from "../lib/achievements";
import { isUserSubscribed, getSubscriptionSettings } from "../lib/customerSubscription";

const router: IRouter = Router();

const orderItemInputSchema = z.object({
  menuItemId: z.string().min(1),
  qty: z.number().int().positive().max(99),
});

const createOrderSchema = z
  .object({
    orderText: z.string().min(1).optional(),
    restaurantName: z.string().default(""),
    address: z.string().default(""),
    promoCode: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    restaurantId: z.string().optional(),
    usePoints: z.boolean().optional(),
    items: z.array(orderItemInputSchema).max(100).optional(),
  })
  .refine(
    (d) =>
      (d.items != null && d.items.length > 0) ||
      (d.orderText != null && d.orderText.trim().length > 0),
    { message: "items_or_orderText_required" },
  );

async function validatePromoForUser(code: string, userId: string, deliveryFee?: number, restaurantId?: string): Promise<{
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
  if (promo.restaurantId != null && promo.restaurantId !== (restaurantId ?? "")) {
    return { valid: false, error: "wrong_restaurant" };
  }

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

  const orderIds = allRows.map((o) => o.id);
  const loyaltyTxs = orderIds.length > 0
    ? await db
        .select({ orderId: loyaltyTransactionsTable.orderId, type: loyaltyTransactionsTable.type, points: loyaltyTransactionsTable.points })
        .from(loyaltyTransactionsTable)
        .where(and(eq(loyaltyTransactionsTable.userId, userId), inArray(loyaltyTransactionsTable.orderId, orderIds)))
    : [];

  const pointsMap: Record<string, { pointsEarned: number; pointsRedeemed: number }> = {};
  for (const tx of loyaltyTxs) {
    if (!tx.orderId) continue;
    const entry = pointsMap[tx.orderId] ?? { pointsEarned: 0, pointsRedeemed: 0 };
    if (tx.type === "earn") entry.pointsEarned += tx.points;
    else if (tx.type === "redeem") entry.pointsRedeemed += tx.points;
    pointsMap[tx.orderId] = entry;
  }

  const itemRows = orderIds.length > 0
    ? await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];
  const itemsMap: Record<string, typeof itemRows> = {};
  for (const it of itemRows) {
    (itemsMap[it.orderId] ??= []).push(it);
  }

  const orders = allRows.map((o) => ({
    ...o,
    pointsEarned: pointsMap[o.id]?.pointsEarned ?? 0,
    pointsRedeemed: pointsMap[o.id]?.pointsRedeemed ?? 0,
    items: itemsMap[o.id] ?? [],
  }));

  res.json({ orders, total, hasMore, page, limit });
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
  const result = await validatePromoForUser(body.data.code, userId, feeForPromo, body.data.restaurantId);
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

  // Structured cart: the server recomputes every line price from the DB.
  // Client-supplied prices are never trusted.
  const computedOrderItems: {
    id: string;
    orderId: string;
    menuItemId: string;
    nameAr: string;
    unitPrice: number;
    qty: number;
    lineTotal: number;
  }[] = [];
  let itemsTotal: number | null = null;
  let itemsRestaurantId: string | null = null;
  let resolvedOrderText = body.data.orderText?.trim() ?? "";

  if (body.data.items && body.data.items.length > 0) {
    const menuIds = body.data.items.map((i) => i.menuItemId);
    const menuRows = await db
      .select()
      .from(menuItemsTable)
      .where(inArray(menuItemsTable.id, menuIds));
    const byId = new Map(menuRows.map((m) => [m.id, m]));

    let total = 0;
    for (const it of body.data.items) {
      const menuItem = byId.get(it.menuItemId);
      if (!menuItem) {
        res.status(400).json({ error: "invalid_item", menuItemId: it.menuItemId });
        return;
      }
      if (body.data.restaurantId && menuItem.restaurantId !== body.data.restaurantId) {
        res.status(400).json({ error: "item_wrong_restaurant", menuItemId: it.menuItemId });
        return;
      }
      // Enforce a single-restaurant cart server-side, independent of any
      // client-supplied restaurantId, so mixed-restaurant carts are rejected.
      if (itemsRestaurantId === null) {
        itemsRestaurantId = menuItem.restaurantId;
      } else if (menuItem.restaurantId !== itemsRestaurantId) {
        res.status(400).json({ error: "items_cross_restaurant", menuItemId: it.menuItemId });
        return;
      }
      if (!menuItem.isAvailable) {
        res.status(409).json({ error: "item_unavailable", menuItemId: it.menuItemId });
        return;
      }
      const unitPrice = Math.round(
        menuItem.isDeal && menuItem.dealPrice != null ? menuItem.dealPrice : menuItem.price,
      );
      const lineTotal = unitPrice * it.qty;
      total += lineTotal;
      computedOrderItems.push({
        id: `oi_${id}_${computedOrderItems.length}`,
        orderId: id,
        menuItemId: menuItem.id,
        nameAr: menuItem.nameAr,
        unitPrice,
        qty: it.qty,
        lineTotal,
      });
    }
    itemsTotal = total;
    const summary = computedOrderItems
      .map((ci) => (ci.qty > 1 ? `${ci.nameAr} × ${ci.qty}` : ci.nameAr))
      .join("، ");
    resolvedOrderText = body.data.restaurantName
      ? `${body.data.restaurantName}: ${summary}`
      : summary;
  }

  if (!resolvedOrderText) {
    res.status(400).json({ error: "empty_order" });
    return;
  }

  // Prefer the restaurant derived from the validated cart items; fall back to
  // the client-supplied id only for legacy free-text orders.
  const effectiveRestaurantId = itemsRestaurantId ?? body.data.restaurantId ?? null;

  const destLat = body.data.lat ?? DAMASCUS_CENTER_LAT;
  const destLon = body.data.lon ?? DAMASCUS_CENTER_LON;

  let originLat = DAMASCUS_CENTER_LAT;
  let originLon = DAMASCUS_CENTER_LON;
  let restaurantPhone = "";
  if (effectiveRestaurantId) {
    const restaurant = await db
      .select({ lat: restaurantsTable.lat, lon: restaurantsTable.lon, phone: restaurantsTable.phone })
      .from(restaurantsTable)
      .where(eq(restaurantsTable.id, effectiveRestaurantId))
      .limit(1);
    const r = restaurant[0];
    if (r?.lat != null && r?.lon != null) {
      originLat = r.lat;
      originLon = r.lon;
    }
    if (r?.phone) {
      restaurantPhone = r.phone;
    }
  }

  const distanceKm = haversineKm(originLat, originLon, destLat, destLon);
  const { fee: zoneFee } = await getFeeForDistance(distanceKm);

  const [subscribed, subSettings] = await Promise.all([
    isUserSubscribed(userId),
    getSubscriptionSettings(),
  ]);
  const effectiveDeliveryFee = subscribed ? subSettings.subscriberDeliveryFee : zoneFee;

  let promoUseData: { promoId: string; discountAmount: number } | null = null;
  if (body.data.promoCode) {
    const promoResult = await validatePromoForUser(body.data.promoCode, userId, zoneFee, effectiveRestaurantId ?? undefined);
    if (!promoResult.valid) {
      res.status(422).json({ error: "invalid_promo", reason: promoResult.error });
      return;
    }
    promoUseData = { promoId: promoResult.promo.id, discountAmount: promoResult.discountAmount };
  }

  let flashDealSnapshot: { id: string; discountType: string; discountValue: number } | null = null;
  if (effectiveRestaurantId) {
    const now = new Date();
    const [activeDeal] = await db
      .select({
        id: flashDealsTable.id,
        discountType: flashDealsTable.discountType,
        discountValue: flashDealsTable.discountValue,
      })
      .from(flashDealsTable)
      .where(
        and(
          eq(flashDealsTable.restaurantId, effectiveRestaurantId),
          eq(flashDealsTable.isActive, true),
          lte(flashDealsTable.startsAt, now),
          gt(flashDealsTable.endsAt, now),
          or(isNull(flashDealsTable.maxUses), lt(flashDealsTable.usedCount, flashDealsTable.maxUses))
        )
      )
      .limit(1);
    if (activeDeal) {
      flashDealSnapshot = activeDeal;
    }
  }

  const newOrder = {
    id,
    userId,
    orderText: resolvedOrderText,
    restaurantName: body.data.restaurantName,
    restaurantPhone,
    restaurantId: effectiveRestaurantId,
    status: "searching" as const,
    courierName: "",
    courierPhone: "",
    courierRating: 0,
    courierId: "",
    address: body.data.address,
    destinationLat: destLat,
    destinationLon: destLon,
    deliveryFee: effectiveDeliveryFee,
    totalPrice: itemsTotal ?? null,
    flashDealId: null as string | null,
    flashDealDiscount: null as number | null,
    estimatedMinutes,
  };

  let loyaltyRedeemData: { points: number; discountAmount: number } | null = null;
  if (body.data.usePoints) {
    const [loyaltySettings, userRow] = await Promise.all([
      getLoyaltySettings(),
      db.select({ loyaltyPoints: usersTable.loyaltyPoints }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    ]);
    const userPoints = userRow[0]?.loyaltyPoints ?? 0;
    if (userPoints > 0 && loyaltySettings.pointValue > 0) {
      const fullDiscountAmount = calculateRedeemDiscount(userPoints, loyaltySettings.pointValue);
      // Cap discount at the actual payable delivery fee so we never over-redeem points.
      // A user with 5000 pts worth 5000 SYP on a 500 SYP delivery should only burn 500 pts.
      const cappedDiscountAmount = Math.min(fullDiscountAmount, effectiveDeliveryFee);
      if (cappedDiscountAmount > 0) {
        // Compute the minimum points that produce exactly the capped discount.
        const pointsToRedeem = Math.min(
          Math.ceil(cappedDiscountAmount / loyaltySettings.pointValue),
          userPoints
        );
        loyaltyRedeemData = { points: pointsToRedeem, discountAmount: cappedDiscountAmount };
      }
    }
  }

  const rows = await db.transaction(async (tx) => {
    let appliedFlashDeal: { id: string; discountAmount: number } | null = null;
    if (flashDealSnapshot) {
      const updated = await tx
        .update(flashDealsTable)
        .set({ usedCount: sql`used_count + 1` })
        .where(
          and(
            eq(flashDealsTable.id, flashDealSnapshot.id),
            or(isNull(flashDealsTable.maxUses), lt(flashDealsTable.usedCount, flashDealsTable.maxUses))
          )
        )
        .returning({ id: flashDealsTable.id });
      if (updated.length > 0) {
        const base = itemsTotal ?? zoneFee;
        const discountAmount =
          flashDealSnapshot.discountType === "percent"
            ? Math.min(Math.round((base * flashDealSnapshot.discountValue) / 100), base)
            : Math.min(Math.round(flashDealSnapshot.discountValue), base);
        appliedFlashDeal = { id: flashDealSnapshot.id, discountAmount };
        newOrder.flashDealId = flashDealSnapshot.id;
        newOrder.flashDealDiscount = discountAmount;
      }
    }

    const inserted = await tx.insert(ordersTable).values(newOrder).returning();
    if (computedOrderItems.length > 0) {
      await tx.insert(orderItemsTable).values(computedOrderItems);
    }
    await tx.insert(orderStatusHistoryTable).values({
      id: `${id}_searching`,
      orderId: id,
      status: "searching",
    });
    if (promoUseData) {
      await tx.insert(promoUsesTable).values({
        id: `pu_${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
        promoId: promoUseData.promoId,
        userId,
        orderId: id,
        discountAmount: promoUseData.discountAmount,
      });
    }
    if (loyaltyRedeemData) {
      const settings = await getLoyaltySettings();
      const { redeemPointsInTx } = await import("../lib/loyalty");
      try {
        await redeemPointsInTx(tx, userId, id, loyaltyRedeemData.points, settings);
      } catch {
        loyaltyRedeemData = null;
      }
    }
    return { inserted, appliedFlashDeal };
  });

  const flashDealData = rows.appliedFlashDeal;

  void notifyNearbyCouriers(destLat, destLon, body.data.restaurantName, effectiveDeliveryFee);

  if (effectiveRestaurantId) {
    notifyRestaurantNewOrder(effectiveRestaurantId, rows.inserted[0]);
  }

  res.status(201).json({
    ...rows.inserted[0],
    items: computedOrderItems.map((ci) => ({
      menuItemId: ci.menuItemId,
      nameAr: ci.nameAr,
      unitPrice: ci.unitPrice,
      qty: ci.qty,
      lineTotal: ci.lineTotal,
    })),
    appliedPromo: promoUseData ? true : false,
    appliedFlashDeal: flashDealData ? true : false,
    pointsDiscount: loyaltyRedeemData?.discountAmount ?? 0,
    pointsRedeemed: loyaltyRedeemData?.points ?? 0,
    subscriberDiscount: subscribed,
  });
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
  const order = rows[0]!;

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, id));

  const loyaltyTxs = await db
    .select({ type: loyaltyTransactionsTable.type, points: loyaltyTransactionsTable.points })
    .from(loyaltyTransactionsTable)
    .where(and(eq(loyaltyTransactionsTable.orderId, id), eq(loyaltyTransactionsTable.userId, userId)));

  let pointsEarned = 0;
  let pointsRedeemed = 0;
  for (const tx of loyaltyTxs) {
    if (tx.type === "earn") pointsEarned += tx.points;
    else if (tx.type === "redeem") pointsRedeemed += tx.points;
  }

  const NOTE_STATUSES = ["cancelled", "searching"];
  if (NOTE_STATUSES.includes(order.status)) {
    const history = await db
      .select({ note: orderStatusHistoryTable.note })
      .from(orderStatusHistoryTable)
      .where(and(eq(orderStatusHistoryTable.orderId, id), eq(orderStatusHistoryTable.status, order.status)))
      .orderBy(desc(orderStatusHistoryTable.createdAt))
      .limit(1);
    const note = history[0]?.note ?? null;
    res.json({ ...order, cancelNote: note, pointsEarned, pointsRedeemed, items });
    return;
  }
  res.json({ ...order, pointsEarned, pointsRedeemed, items });
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
  notifyOrderUpdate(userId, { ...updated[0], cancelNote: null });
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

  void checkAndAwardAchievements(userId);

  res.status(201).json(rows[0]);
});

export default router;
