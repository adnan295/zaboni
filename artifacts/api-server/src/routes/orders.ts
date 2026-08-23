import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, orderItemsTable, menuItemsTable, orderStatusHistoryTable, orderRatingsTable, restaurantsTable, promoCodesTable, promoUsesTable, promoTargetsTable, usersTable, flashDealsTable, loyaltyTransactionsTable, menuItemOptionsTable, menuItemOptionGroupsTable, orderItemOptionsTable, systemSettingsTable } from "@workspace/db";
import { and, avg, count, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { notifyOrderUpdate, notifyNearbyCouriers, notifyRestaurantNewOrder } from "../orders/server";
import { haversineKm, getFeeForDistance, DEFAULT_DELIVERY_FEE_SYP, DAMASCUS_CENTER_LAT, DAMASCUS_CENTER_LON } from "../lib/deliveryZones";
import { checkCoverage, getActiveCoverageAreas, areaIdsContaining, pointInAllowedArea } from "../lib/coverage";
import { getLoyaltySettings, calculateRedeemDiscount, redeemLoyaltyPoints } from "../lib/loyalty";
import { checkAndAwardAchievements } from "../lib/achievements";
import { isUserSubscribed, getSubscriptionSettings } from "../lib/customerSubscription";

const router: IRouter = Router();

const orderItemInputSchema = z.object({
  menuItemId: z.string().min(1),
  qty: z.number().int().positive().max(99),
  note: z.string().max(200).optional(),
  selectedOptions: z.array(z.object({ optionId: z.string().min(1) })).optional(),
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
    flashDealId: z.string().optional(),
    orderType: z.enum(["restaurant", "errand"]).default("restaurant"),
    placeName: z.string().max(200).optional(),
    restaurantNote: z.string().max(500).optional(),
  })
  .refine(
    (d) =>
      (d.items != null && d.items.length > 0) ||
      (d.orderText != null && d.orderText.trim().length > 0) ||
      (d.orderType === "errand" && d.placeName != null && d.placeName.trim().length > 0),
    { message: "items_or_orderText_required" },
  );

const DEFAULT_ERRAND_DELIVERY_FEE = 150;

// Errand ("free"/external) order delivery fee, read from the admin-editable
// settings (key: errand_delivery_fee) so the price can be changed from the
// dashboard WITHOUT publishing a new app build. Falls back to the default.
async function getErrandDeliveryFee(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "errand_delivery_fee"))
      .limit(1);
    const raw = parseInt(row?.value ?? "", 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ERRAND_DELIVERY_FEE;
  } catch {
    return DEFAULT_ERRAND_DELIVERY_FEE;
  }
}

// Rough delivery ETA from the trip distance: a base for prep/pickup handling
// plus travel time. ~4 min/km reflects slow in-city delivery (road detours,
// traffic, pickup), clamped to a sane 15–120 minute window. Replaces the old
// random 30–44 min guess so the customer sees a distance-aware estimate.
function estimateMinutesFromDistance(distanceKm: number): number {
  const mins = 15 + Math.round((Number.isFinite(distanceKm) ? distanceKm : 0) * 4);
  return Math.max(15, Math.min(mins, 120));
}

type PromoContext = {
  userId: string;
  userPhone: string;
  deliveredCount: number;
  lastDeliveredAt: Date | null;
  deliveryFee: number;
  itemsTotal: number;
  restaurantId: string;
};

async function loadPromoContext(
  userId: string,
  deliveryFee: number,
  itemsTotal: number,
  restaurantId: string,
): Promise<PromoContext> {
  const [userRow] = await db
    .select({ phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const [statsRow] = await db
    .select({ c: count(), last: sql<string | null>`max(${ordersTable.updatedAt})` })
    .from(ordersTable)
    .where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered")));
  return {
    userId,
    userPhone: userRow?.phone ?? "",
    deliveredCount: Number(statsRow?.c ?? 0),
    lastDeliveredAt: statsRow?.last ? new Date(statsRow.last) : null,
    deliveryFee,
    itemsTotal,
    restaurantId,
  };
}

// Single source of truth for whether a promo applies to an order and how much it
// discounts. Shared by manual code redemption AND automatic promos, so the rules
// (window, limits, min order, first-order, audience, cap) live in one place.
async function evaluatePromo(
  promo: typeof promoCodesTable.$inferSelect,
  ctx: PromoContext,
): Promise<{ ok: false; error: string } | { ok: true; discountAmount: number; target: "food" | "delivery" }> {
  const now = new Date();
  if (!promo.isActive) return { ok: false, error: "invalid" };
  if (promo.startsAt && promo.startsAt > now) return { ok: false, error: "not_started" };
  if (promo.expiresAt && promo.expiresAt < now) return { ok: false, error: "expired" };
  if (promo.restaurantId != null && promo.restaurantId !== ctx.restaurantId) {
    return { ok: false, error: "wrong_restaurant" };
  }
  if (promo.minOrderValue != null && ctx.itemsTotal < promo.minOrderValue) {
    return { ok: false, error: "min_order" };
  }

  const [globalUseRow] = await db
    .select({ c: count() })
    .from(promoUsesTable)
    .where(eq(promoUsesTable.promoId, promo.id));
  if (promo.maxUses != null && Number(globalUseRow?.c ?? 0) >= promo.maxUses) {
    return { ok: false, error: "exhausted" };
  }
  const [userUseRow] = await db
    .select({ c: count() })
    .from(promoUsesTable)
    .where(and(eq(promoUsesTable.promoId, promo.id), eq(promoUsesTable.userId, ctx.userId)));
  if (Number(userUseRow?.c ?? 0) >= promo.maxUsesPerUser) {
    return { ok: false, error: "already_used" };
  }

  if (promo.firstOrderOnly && ctx.deliveredCount > 0) return { ok: false, error: "not_first_order" };

  if (promo.audience === "new" && ctx.deliveredCount > 0) return { ok: false, error: "not_eligible" };
  if (promo.audience === "inactive") {
    const days = promo.inactiveDays ?? 30;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    if (ctx.lastDeliveredAt && ctx.lastDeliveredAt > cutoff) return { ok: false, error: "not_eligible" };
  }
  if (promo.audience === "specific") {
    if (!ctx.userPhone) return { ok: false, error: "not_eligible" };
    const [t] = await db
      .select({ id: promoTargetsTable.id })
      .from(promoTargetsTable)
      .where(and(eq(promoTargetsTable.promoId, promo.id), eq(promoTargetsTable.phone, ctx.userPhone)))
      .limit(1);
    if (!t) return { ok: false, error: "not_eligible" };
  }

  // "delivery" discounts the fee (courier is compensated by the caller); anything
  // else discounts the food. Free delivery = a 100% percent discount on delivery.
  const target: "food" | "delivery" = promo.appliesTo === "delivery" ? "delivery" : "food";
  const base = target === "delivery" ? ctx.deliveryFee : ctx.itemsTotal;
  if (base <= 0) return { ok: false, error: "not_applicable" };
  let discountAmount = promo.type === "percent"
    ? Math.round((base * promo.value) / 100)
    : Math.round(promo.value);
  if (promo.type === "percent" && promo.maxDiscount != null) {
    discountAmount = Math.min(discountAmount, promo.maxDiscount);
  }
  discountAmount = Math.max(0, Math.min(discountAmount, base));
  if (discountAmount <= 0) return { ok: false, error: "not_applicable" };

  return { ok: true, discountAmount, target };
}

async function validatePromoForUser(code: string, userId: string, deliveryFee?: number, itemsTotal?: number, restaurantId?: string): Promise<{
  valid: false; error: string;
} | {
  valid: true;
  promo: typeof promoCodesTable.$inferSelect;
  discountAmount: number;
  target: "food" | "delivery";
}> {
  const [promo] = await db
    .select()
    .from(promoCodesTable)
    .where(and(eq(promoCodesTable.code, code.toUpperCase()), eq(promoCodesTable.isActive, true)))
    .limit(1);
  if (!promo) return { valid: false, error: "invalid" };
  const ctx = await loadPromoContext(userId, deliveryFee ?? DEFAULT_DELIVERY_FEE_SYP, itemsTotal ?? 0, restaurantId ?? "");
  const result = await evaluatePromo(promo, ctx);
  if (!result.ok) return { valid: false, error: result.error };
  return { valid: true, promo, discountAmount: result.discountAmount, target: result.target };
}

// Best automatic promo for a user who did NOT enter a code (e.g. first-order free
// delivery). Returns the same shape a validated code produces so the order flow
// records it identically — no separate code path.
async function findAutoApplyPromo(
  userId: string,
  deliveryFee: number,
  itemsTotal: number,
  restaurantId: string,
): Promise<{ promo: typeof promoCodesTable.$inferSelect; discountAmount: number; target: "food" | "delivery" } | null> {
  const promos = await db
    .select()
    .from(promoCodesTable)
    .where(and(eq(promoCodesTable.isActive, true), eq(promoCodesTable.autoApply, true)));
  if (promos.length === 0) return null;
  const ctx = await loadPromoContext(userId, deliveryFee, itemsTotal, restaurantId);
  let best: { promo: typeof promoCodesTable.$inferSelect; discountAmount: number; target: "food" | "delivery" } | null = null;
  for (const promo of promos) {
    const r = await evaluatePromo(promo, ctx);
    if (r.ok && (!best || r.discountAmount > best.discountAmount)) {
      best = { promo, discountAmount: r.discountAmount, target: r.target };
    }
  }
  return best;
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
  const feeResult = await getFeeForDistance(distanceKm);
  const { fee, zone } = feeResult;

  const coverage = await checkCoverage(latRaw, lonRaw);
  const outOfArea = coverage.hasCoverage ? !coverage.inside : feeResult.outOfRange;

  res.json({
    fee,
    outOfRange: outOfArea,
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
    itemsTotal: z.number().nonnegative().optional(),
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
  const result = await validatePromoForUser(body.data.code, userId, feeForPromo, body.data.itemsTotal, body.data.restaurantId);
  if (!result.valid) {
    res.status(422).json({ valid: false, error: result.error });
    return;
  }
  res.json({
    valid: true,
    type: result.promo.type,
    value: result.promo.value,
    discountAmount: result.discountAmount,
    target: result.target,
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

  // Require the customer's map location on every order. Without it the delivery
  // fee (distance-based) and the courier's navigation cannot be computed, so we
  // reject rather than silently falling back to a default city-center point.
  if (body.data.lat == null || body.data.lon == null) {
    res.status(400).json({ error: "location_required", message: "يرجى تحديد موقعك على الخريطة قبل إرسال الطلب." });
    return;
  }

  const id = `${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

  // Errand (concierge) order: fixed 10,000 SYP delivery fee, no restaurant lookup.
  if (body.data.orderType === "errand") {
    const placeName = body.data.placeName?.trim() ?? "";
    const itemsText = body.data.orderText?.trim() ?? "";
    if (!placeName) {
      res.status(400).json({ error: "errand_place_name_required" });
      return;
    }
    const errandOrderText = itemsText ? `${placeName}: ${itemsText}` : placeName;
    const destLat = body.data.lat ?? DAMASCUS_CENTER_LAT;
    const destLon = body.data.lon ?? DAMASCUS_CENTER_LON;

    // Reject errands whose destination is outside the delivery coverage area.
    // A drawn coverage polygon is authoritative; otherwise fall back to the
    // distance-based cutoff (measured from the city center, since an errand has
    // no restaurant origin).
    const errandCoverage = await checkCoverage(destLat, destLon);
    const errandDistanceKm = haversineKm(DAMASCUS_CENTER_LAT, DAMASCUS_CENTER_LON, destLat, destLon);
    const errandFeeResult = await getFeeForDistance(errandDistanceKm);
    const errandOutOfArea = errandCoverage.hasCoverage
      ? !errandCoverage.inside
      : errandFeeResult.outOfRange;
    if (errandOutOfArea) {
      res.status(422).json({
        error: "outside_delivery_area",
        message: "عذراً، موقعك خارج نطاق التوصيل المتاح حالياً، لا يمكن إتمام الطلب لهذا الموقع.",
      });
      return;
    }

    const errandDeliveryFee = await getErrandDeliveryFee();
    const estimatedMinutes = estimateMinutesFromDistance(errandDistanceKm);

    const errandOrder = {
      id,
      userId,
      orderText: errandOrderText,
      restaurantName: "",
      restaurantPhone: "",
      restaurantId: null as string | null,
      status: "searching" as const,
      courierName: "",
      courierPhone: "",
      courierRating: 0,
      courierId: "",
      address: body.data.address,
      destinationLat: destLat,
      destinationLon: destLon,
      deliveryFee: errandDeliveryFee,
      totalPrice: null as number | null,
      flashDealId: null as string | null,
      flashDealDiscount: null as number | null,
      estimatedMinutes,
      orderType: "errand",
      placeName,
    };
    await db.transaction(async (tx) => {
      await tx.insert(ordersTable).values(errandOrder);
      await tx.insert(orderStatusHistoryTable).values({
        id: `${id}_searching`,
        orderId: id,
        status: "searching",
      });
    });
    void notifyNearbyCouriers(id, null, placeName, errandOrder.deliveryFee);
    res.status(201).json({ ...errandOrder, items: [] });
    return;
  }

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
    note: string | null;
  }[] = [];
  // Options to insert after order items are saved
  const pendingItemOptions: {
    itemIdx: number;
    optionId: string;
    nameAr: string;
    extraPrice: number;
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

    // Pre-fetch all requested option prices, joined with groups for ownership verification
    const allOptionIds = body.data.items
      .flatMap((i) => i.selectedOptions?.map((o) => o.optionId) ?? []);
    const optionsById = new Map<string, { nameAr: string; extraPrice: number; groupId: string; menuItemId: string }>();
    if (allOptionIds.length > 0) {
      const optionRows = await db
        .select({
          id: menuItemOptionsTable.id,
          nameAr: menuItemOptionsTable.nameAr,
          extraPrice: menuItemOptionsTable.extraPrice,
          groupId: menuItemOptionsTable.groupId,
          menuItemId: menuItemOptionGroupsTable.menuItemId,
        })
        .from(menuItemOptionsTable)
        .innerJoin(menuItemOptionGroupsTable, eq(menuItemOptionsTable.groupId, menuItemOptionGroupsTable.id))
        .where(inArray(menuItemOptionsTable.id, allOptionIds));
      for (const o of optionRows) optionsById.set(o.id, { nameAr: o.nameAr, extraPrice: o.extraPrice, groupId: o.groupId, menuItemId: o.menuItemId });
    }

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
      const baseUnitPrice = Math.round(
        menuItem.isDeal && menuItem.dealPrice != null ? menuItem.dealPrice : menuItem.price,
      );
      // Compute extra price from selected options (server-side lookup)
      // Validate: option must belong to this menu item; enforce at most one per group
      let optionsExtra = 0;
      const itemIdx = computedOrderItems.length;
      const seenGroups = new Set<string>();
      for (const sel of it.selectedOptions ?? []) {
        const opt = optionsById.get(sel.optionId);
        if (!opt) {
          res.status(400).json({ error: "invalid_option", optionId: sel.optionId });
          return;
        }
        if (opt.menuItemId !== it.menuItemId) {
          res.status(400).json({ error: "option_wrong_item", optionId: sel.optionId });
          return;
        }
        if (seenGroups.has(opt.groupId)) {
          res.status(400).json({ error: "duplicate_option_group", groupId: opt.groupId });
          return;
        }
        seenGroups.add(opt.groupId);
        optionsExtra += opt.extraPrice;
        pendingItemOptions.push({ itemIdx, optionId: sel.optionId, nameAr: opt.nameAr, extraPrice: opt.extraPrice });
      }
      const unitPrice = baseUnitPrice + optionsExtra;
      const lineTotal = unitPrice * it.qty;
      total += lineTotal;
      computedOrderItems.push({
        id: `oi_${id}_${itemIdx}`,
        orderId: id,
        menuItemId: menuItem.id,
        nameAr: menuItem.nameAr,
        unitPrice,
        qty: it.qty,
        lineTotal,
        note: it.note ?? null,
      });
    }
    itemsTotal = total;
    const summary = computedOrderItems
      .map((ci) => {
        const base = ci.qty > 1 ? `${ci.nameAr} × ${ci.qty}` : ci.nameAr;
        return ci.note ? `${base} (${ci.note})` : base;
      })
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
  let restaurantHasCoords = false;
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
      restaurantHasCoords = true;
    }
    if (r?.phone) {
      restaurantPhone = r.phone;
    }
  }

  const distanceKm = haversineKm(originLat, originLon, destLat, destLon);
  const feeResult = await getFeeForDistance(distanceKm);
  const estimatedMinutes = estimateMinutesFromDistance(distanceKm);

  // Coverage gate. When coverage areas (regions/cities) are configured the
  // customer AND the restaurant must be in the SAME area — so a customer can't
  // order from a restaurant in another city. With no areas configured we fall
  // back to the distance-based cutoff.
  const coverageAreas = await getActiveCoverageAreas();
  if (coverageAreas.length > 0) {
    const customerAreaIds = areaIdsContaining(destLat, destLon, coverageAreas);
    if (customerAreaIds.size === 0) {
      res.status(422).json({
        error: "outside_delivery_area",
        message: "عذراً، موقعك خارج نطاق التوصيل المتاح حالياً، لا يمكن إتمام الطلب لهذا الموقع.",
      });
      return;
    }
    // The restaurant must sit in the customer's area. A restaurant with no
    // coordinates can't be verified, so it's blocked while scoping is active —
    // matching the listing, which hides un-located restaurants. (Errand orders
    // have no restaurant and skip this whole block.)
    if (effectiveRestaurantId && (!restaurantHasCoords || !pointInAllowedArea(originLat, originLon, coverageAreas, customerAreaIds))) {
      res.status(422).json({
        error: "restaurant_out_of_area",
        message: "عذراً، هذا المطعم لا يوصّل إلى منطقتك.",
      });
      return;
    }
  } else if (feeResult.outOfRange) {
    res.status(422).json({
      error: "outside_delivery_area",
      message: "عذراً، موقعك خارج نطاق التوصيل المتاح حالياً، لا يمكن إتمام الطلب لهذا الموقع.",
    });
    return;
  }
  const zoneFee = feeResult.fee;

  const [subscribed, subSettings] = await Promise.all([
    isUserSubscribed(userId),
    getSubscriptionSettings(),
  ]);
  const effectiveDeliveryFee = subscribed ? subSettings.subscriberDeliveryFee : zoneFee;

  let promoUseData: { promoId: string; discountAmount: number; target: "food" | "delivery" } | null = null;
  if (body.data.promoCode) {
    const promoResult = await validatePromoForUser(body.data.promoCode, userId, zoneFee, itemsTotal ?? undefined, effectiveRestaurantId ?? undefined);
    if (!promoResult.valid) {
      res.status(422).json({ error: "invalid_promo", reason: promoResult.error });
      return;
    }
    promoUseData = { promoId: promoResult.promo.id, discountAmount: promoResult.discountAmount, target: promoResult.target };
  }

  // No code entered → apply the best eligible AUTOMATIC promo (e.g. first-order
  // free delivery). Recorded the same way as a code so it respects usage limits.
  if (!promoUseData) {
    const auto = await findAutoApplyPromo(userId, zoneFee, itemsTotal ?? 0, effectiveRestaurantId ?? "");
    if (auto) {
      promoUseData = { promoId: auto.promo.id, discountAmount: auto.discountAmount, target: auto.target };
    }
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
          or(isNull(flashDealsTable.maxUses), lt(flashDealsTable.usedCount, flashDealsTable.maxUses)),
          body.data.flashDealId ? eq(flashDealsTable.id, body.data.flashDealId) : undefined
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
    courierFeeDiscount: 0,
    totalPrice: itemsTotal ?? null,
    flashDealId: null as string | null,
    flashDealDiscount: null as number | null,
    estimatedMinutes,
    orderType: "restaurant",
    placeName: null as string | null,
    restaurantNote: body.data.restaurantNote ?? null,
  };

  let loyaltyRedeemData: { points: number; discountAmount: number } | null = null;
  let loyaltyPointValue = 0;
  if (body.data.usePoints) {
    const [loyaltySettings, userRow] = await Promise.all([
      getLoyaltySettings(),
      db.select({ loyaltyPoints: usersTable.loyaltyPoints }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    ]);
    const userPoints = userRow[0]?.loyaltyPoints ?? 0;
    loyaltyPointValue = loyaltySettings.pointValue;
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
        const applyDiscount = (base: number) =>
          flashDealSnapshot!.discountType === "percent"
            ? Math.max(0, Math.min(Math.round((base * flashDealSnapshot!.discountValue) / 100), base))
            : Math.max(0, Math.min(Math.round(flashDealSnapshot!.discountValue), base));

        // Flash deals are the restaurant's own promotion, so they discount the
        // food only. The delivery fee — and therefore the courier's pay — is
        // never touched by a flash deal.
        const discountOnItems = itemsTotal !== null ? applyDiscount(itemsTotal) : 0;

        appliedFlashDeal = { id: flashDealSnapshot.id, discountAmount: discountOnItems };
        newOrder.flashDealId = flashDealSnapshot.id;
        newOrder.flashDealDiscount = discountOnItems;
        if (itemsTotal !== null) {
          newOrder.totalPrice = Math.max(0, itemsTotal - discountOnItems);
        }
      }
    }

    // Promo-code discount reduces the delivery fee. It's recorded separately in
    // promo_uses, but it must ALSO come off the stored fee — otherwise the
    // courier collects the full (undiscounted) amount. Cap at the fee left after
    // any flash-deal discount.
    if (promoUseData) {
      if (promoUseData.target === "food") {
        // Restaurant-funded code → discount the food; the courier's fee is untouched.
        const applied = newOrder.totalPrice != null
          ? Math.min(promoUseData.discountAmount, newOrder.totalPrice)
          : 0;
        if (newOrder.totalPrice != null) {
          newOrder.totalPrice = Math.max(0, newOrder.totalPrice - applied);
        }
        promoUseData.discountAmount = applied;
      } else {
        // Platform code → discount the delivery fee and compensate the courier.
        const applied = Math.min(promoUseData.discountAmount, newOrder.deliveryFee);
        newOrder.deliveryFee = Math.max(0, newOrder.deliveryFee - applied);
        promoUseData.discountAmount = applied;
        newOrder.courierFeeDiscount += applied;
      }
    }

    // Loyalty-points redemption also discounts the delivery fee. Same fix: the
    // points were being burned while the discount never came off the stored fee.
    // Cap at the remaining fee and re-derive the points actually spent so we
    // never burn more points than the discount granted.
    if (loyaltyRedeemData) {
      const applied = Math.min(loyaltyRedeemData.discountAmount, newOrder.deliveryFee);
      if (applied <= 0) {
        loyaltyRedeemData = null;
      } else {
        newOrder.deliveryFee = Math.max(0, newOrder.deliveryFee - applied);
        newOrder.courierFeeDiscount += applied;
        const pointsForApplied =
          loyaltyPointValue > 0
            ? Math.min(Math.ceil(applied / loyaltyPointValue), loyaltyRedeemData.points)
            : loyaltyRedeemData.points;
        loyaltyRedeemData = { points: pointsForApplied, discountAmount: applied };
      }
    }

    const inserted = await tx.insert(ordersTable).values(newOrder).returning();
    if (computedOrderItems.length > 0) {
      await tx.insert(orderItemsTable).values(computedOrderItems);
      if (pendingItemOptions.length > 0) {
        const optionRows = pendingItemOptions.map((p) => ({
          id: `oio_${id}_${p.itemIdx}_${p.optionId}`,
          orderItemId: computedOrderItems[p.itemIdx]!.id,
          optionId: p.optionId,
          nameAr: p.nameAr,
          extraPrice: p.extraPrice,
        }));
        await tx.insert(orderItemOptionsTable).values(optionRows);
      }
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

  void notifyNearbyCouriers(id, effectiveRestaurantId, body.data.restaurantName, newOrder.deliveryFee);

  if (effectiveRestaurantId) {
    notifyRestaurantNewOrder(effectiveRestaurantId, rows.inserted[0]);
  }

  res.status(201).json({
    ...rows.inserted[0],
    items: computedOrderItems.map((ci, idx) => ({
      menuItemId: ci.menuItemId,
      nameAr: ci.nameAr,
      unitPrice: ci.unitPrice,
      qty: ci.qty,
      lineTotal: ci.lineTotal,
      note: ci.note ?? null,
      options: pendingItemOptions
        .filter((p) => p.itemIdx === idx)
        .map((p) => ({ optionId: p.optionId, nameAr: p.nameAr, extraPrice: p.extraPrice })),
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

  // Attribute the rating to the restaurant stored on the order itself. Matching
  // by name is unreliable (two restaurants can share a name, and a rename breaks
  // the link), so we trust the order's restaurantId and only fall back to a name
  // lookup for legacy orders saved before restaurantId was recorded.
  let restaurantId: string | null = o.restaurantId ?? null;
  if (!restaurantId && restaurantName) {
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

  // Roll the new rating up into the restaurant's displayed score. The list and
  // restaurant page read restaurantsTable.rating, so without this the star shown
  // to customers never reflects the ratings they actually leave. Best-effort:
  // a failure here must not fail the rating that was already saved.
  if (restaurantId) {
    try {
      const [agg] = await db
        .select({ avgStars: avg(orderRatingsTable.restaurantStars) })
        .from(orderRatingsTable)
        .where(eq(orderRatingsTable.restaurantId, restaurantId));
      const newAvg = Number(agg?.avgStars ?? 0);
      await db
        .update(restaurantsTable)
        .set({ rating: Math.round(newAvg * 10) / 10 })
        .where(eq(restaurantsTable.id, restaurantId));
    } catch {
      // ignore — rating is saved; restaurant aggregate will catch up next time
    }
  }

  void checkAndAwardAchievements(userId);

  res.status(201).json(rows[0]);
});

export default router;
