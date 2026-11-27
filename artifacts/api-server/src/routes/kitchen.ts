import { requireCurrentApp, UPDATE_MESSAGE } from "../lib/appVersion";
// Customer API for the "بيتي وصحّي" pre-order section (see lib/kitchen).
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import {
  KitchenError, getKitchenSettings, listDays, getMenu, getMeal, placeOrder, placeSubscription,
  cancelSubscription, listSubscriptions, isDay, SUBSCRIPTION_GOALS, type DeliveryQuote,
} from "../lib/kitchen";
import { haversineKm, getFeeForDistance, DAMASCUS_CENTER_LAT, DAMASCUS_CENTER_LON } from "../lib/deliveryZones";
import { roadKm } from "../lib/roadDistance";
import { checkCoverage } from "../lib/coverage";
import { isUserSubscribed, getSubscriptionSettings } from "../lib/customerSubscription";
import { notifyRestaurantNewOrder } from "../orders/server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function fail(res: Response, err: unknown): void {
  if (err instanceof KitchenError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  logger.error({ err }, "[kitchen] request failed");
  res.status(500).json({ error: "server_error", message: "صار خطأ، جرّب مرة تانية." });
}

/** Same delivery pricing and coverage rules as a restaurant order. */
function makeQuote(userId: string): DeliveryQuote {
  let subscriberFee: number | null | undefined;
  return async (kitchen, dest) => {
    const coverage = await checkCoverage(dest.lat, dest.lon);
    const km = haversineKm(kitchen.lat ?? DAMASCUS_CENTER_LAT, kitchen.lon ?? DAMASCUS_CENTER_LON, dest.lat, dest.lon);
    const road = kitchen.lat != null && kitchen.lon != null ? await roadKm({ lat: kitchen.lat, lon: kitchen.lon }, dest) : null;
    const fee = await getFeeForDistance(km, road);
    if (coverage.hasCoverage ? !coverage.inside : fee.outOfRange) {
      throw new KitchenError("outside_delivery_area", "عذراً، موقعك خارج نطاق التوصيل المتاح حالياً.");
    }
    if (subscriberFee === undefined) {
      subscriberFee = (await isUserSubscribed(userId)) ? (await getSubscriptionSettings()).subscriberDeliveryFee : null;
    }
    return subscriberFee ?? fee.fee;
  };
}

const userIdOf = (req: Request): string => req.auth!.userId;

router.get("/kitchen/config", async (_req, res) => {
  try {
    const s = await getKitchenSettings();
    res.json({
      enabled: s.enabled, title: s.title, cutoffHour: s.cutoffHour, windows: s.windows,
      subscriptionDiscountPct: s.subscriptionDiscountPct, minSubscriptionDays: s.minSubscriptionDays,
      goals: SUBSCRIPTION_GOALS, days: s.enabled ? listDays(s, new Date()) : [],
    });
  } catch {
    // Never let this optional section break the home screen.
    res.json({ enabled: false });
  }
});

router.get("/kitchen/menu", async (req, res) => {
  try {
    const s = await getKitchenSettings();
    if (!s.enabled) throw new KitchenError("kitchen_disabled", "هالقسم مو متاح حالياً.", 404);
    const days = listDays(s, new Date());
    const wanted = typeof req.query["day"] === "string" && isDay(req.query["day"]) ? req.query["day"] : null;
    const day = days.find((d) => d.day === wanted) ?? days.find((d) => d.open) ?? days[0]!;
    res.json({ day: day.day, open: day.open, closesAt: day.closesAt, days, meals: await getMenu(day.day) });
  } catch (err) { fail(res, err); }
});

router.get("/kitchen/meals/:id", async (req, res) => {
  try {
    const s = await getKitchenSettings();
    if (!s.enabled) throw new KitchenError("kitchen_disabled", "هالقسم مو متاح حالياً.", 404);
    const day = String(req.query["day"] ?? "");
    if (!isDay(day)) throw new KitchenError("bad_day", "اليوم المطلوب غير صالح.", 400);
    const meal = await getMeal(String(req.params["id"]), day);
    if (!meal) throw new KitchenError("not_found", "الوجبة غير متوفرة لهاليوم.", 404);
    const slot = listDays(s, new Date()).find((d) => d.day === day);
    res.json({ meal, day, open: !!slot?.open, closesAt: slot?.closesAt ?? null, windows: s.windows });
  } catch (err) { fail(res, err); }
});

// The delivery fee the customer will pay per kitchen, so the app can show the real
// total before they confirm. One fee per kitchen per delivery day.
router.get("/kitchen/quote", async (req, res) => {
  try {
    const lat = Number(req.query["lat"]), lon = Number(req.query["lon"]);
    const ids = String(req.query["kitchenIds"] ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || ids.length === 0) throw new KitchenError("bad_request", "بيانات ناقصة.", 400);
    const { rows } = await pool.query(`SELECT id, lat, lon FROM restaurants WHERE id = ANY($1) AND kind = 'kitchen'`, [ids]);
    const quote = makeQuote(userIdOf(req));
    const fees: Record<string, number> = {};
    for (const r of rows) {
      fees[String(r.id)] = await quote(
        { id: String(r.id), lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon) },
        { lat, lon },
      );
    }
    res.json({ fees });
  } catch (err) { fail(res, err); }
});

const placeSchema = z.object({
  day: z.string(),
  window: z.string(),
  address: z.string().trim().min(3).max(500),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  items: z.array(z.object({ mealId: z.string().min(1), qty: z.number().int().min(1).max(10) })).min(1).max(10),
});

router.post("/kitchen/orders", requireCurrentApp(UPDATE_MESSAGE), async (req, res) => {
  try {
    const body = placeSchema.safeParse(req.body);
    if (!body.success) throw new KitchenError("bad_request", "بيانات الطلب ناقصة.", 400);
    const userId = userIdOf(req);
    const orders = await placeOrder({ userId, ...body.data }, makeQuote(userId));
    // The cook sees it on their portal straight away, and again in the cutoff summary.
    for (const o of orders) notifyRestaurantNewOrder(o.kitchenId, { id: o.id, orderText: `${o.orderText} · ${o.day}` });
    res.status(201).json({ orders });
  } catch (err) { fail(res, err); }
});

const subscribeSchema = z.object({
  goal: z.enum(SUBSCRIPTION_GOALS),
  window: z.string(),
  address: z.string().trim().min(3).max(500),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  days: z.array(z.object({ day: z.string(), mealId: z.string().min(1) })).min(1).max(7),
});

router.post("/kitchen/subscriptions", async (req, res) => {
  try {
    const body = subscribeSchema.safeParse(req.body);
    if (!body.success) throw new KitchenError("bad_request", "بيانات الاشتراك ناقصة.", 400);
    const userId = userIdOf(req);
    const sub = await placeSubscription({ userId, ...body.data }, makeQuote(userId));
    for (const o of sub.orders) notifyRestaurantNewOrder(o.kitchenId, { id: o.id, orderText: `${o.orderText} · ${o.day}` });
    res.status(201).json(sub);
  } catch (err) { fail(res, err); }
});

router.get("/kitchen/subscriptions", async (req, res) => {
  try { res.json({ subscriptions: await listSubscriptions(userIdOf(req)) }); } catch (err) { fail(res, err); }
});

router.delete("/kitchen/subscriptions/:id", async (req, res) => {
  try { res.json(await cancelSubscription(userIdOf(req), String(req.params["id"]))); } catch (err) { fail(res, err); }
});

export default router;
