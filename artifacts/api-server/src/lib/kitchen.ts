// "بيتي وصحّي": home-cooked and calorie-counted meals, ordered ahead.
//
// How it differs from a restaurant order:
//   - A kitchen is a row in `restaurants` with kind = 'kitchen'. It never shows
//     in the normal restaurant listing, so app versions that predate this
//     section are unaffected.
//   - A meal is only orderable on the days it has portions (kitchen_meal_days),
//     and ordering for a day closes the evening before (cutoff hour).
//   - The order is stored with status 'scheduled' and a delivery window. A job
//     releases it into the normal flow (status 'searching', dispatch to
//     couriers) shortly before the window, so everything downstream — courier
//     app, tracking, completion, reports — works unchanged.
//   - A weekly subscription is simply several scheduled orders created together
//     at a discount; payment stays cash on delivery, day by day.
//
// The whole section is off unless the admin turns it on (kitchen_enabled).

import { pool } from "@workspace/db";
import { logger } from "./logger";

export const KITCHEN_KIND = "kitchen";
export const MEAL_SECTIONS = ["home", "healthy", "dessert"] as const;
export type MealSection = (typeof MEAL_SECTIONS)[number];
export const SUBSCRIPTION_GOALS = ["cut", "balanced", "home"] as const;
export type SubscriptionGoal = (typeof SUBSCRIPTION_GOALS)[number];

/** Syria is UTC+3 all year. */
const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How many days ahead can be ordered. */
export const DAYS_AHEAD = 7;
const MAX_SCHEDULED_PER_USER = 21;
const MAX_QTY_PER_MEAL = 10;

export interface KitchenSettings {
  enabled: boolean;
  title: string;
  /** Hour (0-23, Damascus) on the day BEFORE delivery when ordering closes. */
  cutoffHour: number;
  /** Delivery windows as "HH-HH" in Damascus time. */
  windows: string[];
  subscriptionDiscountPct: number;
  /** Minutes before the window starts that the order is handed to couriers. */
  releaseLeadMinutes: number;
  minSubscriptionDays: number;
}

export const DEFAULT_SETTINGS: KitchenSettings = {
  enabled: false,
  title: "بيتي وصحّي",
  cutoffHour: 21,
  windows: ["12-13", "13-14", "14-15"],
  subscriptionDiscountPct: 10,
  releaseLeadMinutes: 45,
  minSubscriptionDays: 3,
};

export const SETTING_KEYS = {
  enabled: "kitchen_enabled",
  title: "kitchen_title",
  cutoffHour: "kitchen_cutoff_hour",
  windows: "kitchen_windows",
  subscriptionDiscountPct: "kitchen_subscription_discount_pct",
  releaseLeadMinutes: "kitchen_release_lead_minutes",
} as const;

const WINDOW_RE = /^([01]?\d|2[0-3])-([01]?\d|2[0-4])$/;

export function parseWindows(raw: string | null | undefined): string[] {
  const list = String(raw ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter((w) => {
      const m = WINDOW_RE.exec(w);
      return !!m && Number(m[1]) < Number(m[2]);
    });
  return list.length > 0 ? list : DEFAULT_SETTINGS.windows;
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.max(lo, Math.min(hi, n)) : fallback;
};

export function settingsFromRows(rows: { key: string; value: string }[]): KitchenSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: String(m.get(SETTING_KEYS.enabled) ?? "").toLowerCase() === "true",
    title: (m.get(SETTING_KEYS.title) ?? "").trim() || DEFAULT_SETTINGS.title,
    cutoffHour: clampInt(m.get(SETTING_KEYS.cutoffHour), 0, 23, DEFAULT_SETTINGS.cutoffHour),
    windows: parseWindows(m.get(SETTING_KEYS.windows)),
    subscriptionDiscountPct: clampInt(m.get(SETTING_KEYS.subscriptionDiscountPct), 0, 50, DEFAULT_SETTINGS.subscriptionDiscountPct),
    releaseLeadMinutes: clampInt(m.get(SETTING_KEYS.releaseLeadMinutes), 10, 180, DEFAULT_SETTINGS.releaseLeadMinutes),
    minSubscriptionDays: DEFAULT_SETTINGS.minSubscriptionDays,
  };
}

export async function getKitchenSettings(): Promise<KitchenSettings> {
  const { rows } = await pool.query(`SELECT key, value FROM system_settings WHERE key LIKE 'kitchen\\_%'`);
  return settingsFromRows(rows as { key: string; value: string }[]);
}

export async function ensureKitchenSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'restaurant';
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS meal_section TEXT;
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS calories INTEGER;
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS protein_g REAL;
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS carbs_g REAL;
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS fat_g REAL;
    ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS health_tags TEXT NOT NULL DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_day DATE;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_window TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS placed_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS meal_subscription_id TEXT;
    CREATE TABLE IF NOT EXISTS kitchen_meal_days (
      menu_item_id TEXT NOT NULL,
      day DATE NOT NULL,
      portions INTEGER NOT NULL,
      sold INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (menu_item_id, day)
    );
    CREATE INDEX IF NOT EXISTS kitchen_meal_days_day_idx ON kitchen_meal_days (day);
    CREATE TABLE IF NOT EXISTS meal_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      days_count INTEGER NOT NULL,
      discount_pct INTEGER NOT NULL DEFAULT 0,
      delivery_window TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS meal_subscriptions_user_idx ON meal_subscriptions (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_scheduled_idx ON orders (scheduled_day) WHERE status = 'scheduled';
  `);
}

// ─── Days and windows ────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: unknown): s is string => typeof s === "string" && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** The Damascus calendar date of an instant, as YYYY-MM-DD. */
export function damascusDay(at: Date): string {
  return new Date(at.getTime() + DAMASCUS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of `hour`:00 Damascus time on `day`. */
export function damascusInstant(day: string, hour: number): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000 - DAMASCUS_OFFSET_MS);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Ordering for `day` closes the evening before, at the cutoff hour. */
export function cutoffFor(day: string, s: Pick<KitchenSettings, "cutoffHour">): Date {
  return damascusInstant(addDays(day, -1), s.cutoffHour);
}

export const isDayOpen = (day: string, s: Pick<KitchenSettings, "cutoffHour">, now: Date): boolean =>
  now.getTime() < cutoffFor(day, s).getTime();

export interface OrderableDay {
  day: string;
  open: boolean;
  closesAt: string;
}

/** The next DAYS_AHEAD delivery days, starting tomorrow. */
export function listDays(s: Pick<KitchenSettings, "cutoffHour">, now: Date): OrderableDay[] {
  const today = damascusDay(now);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const day = addDays(today, i + 1);
    return { day, open: isDayOpen(day, s, now), closesAt: cutoffFor(day, s).toISOString() };
  });
}

/** When a scheduled order is handed to the courier flow. */
export function releaseAt(day: string, window: string, s: Pick<KitchenSettings, "releaseLeadMinutes">): Date {
  const startHour = Number(window.split("-")[0]);
  return new Date(damascusInstant(day, startHour).getTime() - s.releaseLeadMinutes * 60_000);
}

export const windowLabel = (w: string): string => {
  const [a, b] = w.split("-").map(Number);
  const h = (n: number) => (n! > 12 ? n! - 12 : n!);
  return `${h(a!)} - ${h(b!)}`;
};

export const discounted = (price: number, pct: number): number => Math.max(0, Math.round(price * (1 - pct / 100)));

// ─── Menu ────────────────────────────────────────────────────────────────────

export interface KitchenMeal {
  id: string;
  kitchenId: string;
  kitchenName: string;
  kitchenRating: number;
  kitchenReviewCount: number;
  nameAr: string;
  descriptionAr: string;
  image: string;
  price: number;
  section: MealSection;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tags: string[];
  portions: number;
  left: number;
}

const tagList = (raw: unknown): string[] => String(raw ?? "").split(",").map((t) => t.trim()).filter(Boolean);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function mealFromRow(r: Record<string, unknown>): KitchenMeal {
  const section = (MEAL_SECTIONS as readonly string[]).includes(String(r["meal_section"])) ? (r["meal_section"] as MealSection) : "home";
  const portions = Number(r["portions"] ?? 0);
  return {
    id: String(r["id"]),
    kitchenId: String(r["restaurant_id"]),
    kitchenName: String(r["kitchen_name"] ?? ""),
    kitchenRating: Number(r["kitchen_rating"] ?? 0),
    kitchenReviewCount: Number(r["kitchen_reviews"] ?? 0),
    nameAr: String(r["name_ar"] ?? ""),
    descriptionAr: String(r["description_ar"] ?? ""),
    image: String(r["image"] ?? ""),
    price: Math.round(Number(r["price"] ?? 0)),
    section,
    calories: numOrNull(r["calories"]),
    proteinG: numOrNull(r["protein_g"]),
    carbsG: numOrNull(r["carbs_g"]),
    fatG: numOrNull(r["fat_g"]),
    tags: tagList(r["health_tags"]),
    portions,
    left: Math.max(0, portions - Number(r["sold"] ?? 0)),
  };
}

const MEAL_SELECT = `
  SELECT mi.id, mi.restaurant_id, mi.name_ar, mi.description_ar, mi.image, mi.price, mi.meal_section,
         mi.calories, mi.protein_g, mi.carbs_g, mi.fat_g, mi.health_tags,
         r.name_ar AS kitchen_name, r.rating AS kitchen_rating, r.review_count AS kitchen_reviews,
         kd.portions, kd.sold
  FROM kitchen_meal_days kd
  JOIN menu_items mi ON mi.id = kd.menu_item_id
  JOIN restaurants r ON r.id = mi.restaurant_id
  WHERE r.kind = '${KITCHEN_KIND}' AND r.is_open AND mi.is_available AND kd.portions > 0`;

/** Everything orderable for one day, sold-out meals last. */
export async function getMenu(day: string): Promise<KitchenMeal[]> {
  const { rows } = await pool.query(`${MEAL_SELECT} AND kd.day = $1 ORDER BY (kd.portions - kd.sold > 0) DESC, mi.name_ar`, [day]);
  return rows.map(mealFromRow);
}

export async function getMeal(mealId: string, day: string): Promise<KitchenMeal | null> {
  const { rows } = await pool.query(`${MEAL_SELECT} AND kd.day = $1 AND mi.id = $2 LIMIT 1`, [day, mealId]);
  return rows[0] ? mealFromRow(rows[0]) : null;
}

// ─── Ordering ────────────────────────────────────────────────────────────────

export class KitchenError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

export interface DeliveryQuote {
  /** Delivery fee for one order from this kitchen to the customer. Throws KitchenError when out of area. */
  (kitchen: { id: string; lat: number | null; lon: number | null }, dest: { lat: number; lon: number }): Promise<number>;
}

export interface PlaceInput {
  userId: string;
  day: string;
  window: string;
  items: { mealId: string; qty: number }[];
  address: string;
  lat: number;
  lon: number;
  /** Set when the order belongs to a weekly subscription. */
  subscriptionId?: string | null;
  discountPct?: number;
}

export interface PlacedOrder {
  id: string;
  kitchenId: string;
  kitchenName: string;
  day: string;
  window: string;
  itemsTotal: number;
  deliveryFee: number;
  orderText: string;
}

type Client = { query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

const newId = () => `${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

function validateSlot(day: string, window: string, s: KitchenSettings, now: Date): void {
  if (!isDay(day)) throw new KitchenError("bad_day", "اليوم المطلوب غير صالح.", 400);
  if (!s.windows.includes(window)) throw new KitchenError("bad_window", "وقت التوصيل غير متاح.", 400);
  const days = listDays(s, now);
  const slot = days.find((d) => d.day === day);
  if (!slot) throw new KitchenError("day_out_of_range", "هاليوم مو متاح للطلب.");
  if (!slot.open) throw new KitchenError("day_closed", "سكّر باب الطلب لهاليوم. اختار يوم تاني.");
}

/**
 * Creates one scheduled order per kitchen for a single delivery day, inside the
 * caller's transaction. Portions are reserved atomically: if any meal no longer
 * has enough, the whole call throws and nothing is kept.
 */
export async function placeDayInTx(tx: Client, input: PlaceInput, s: KitchenSettings, quote: DeliveryQuote, now: Date): Promise<PlacedOrder[]> {
  validateSlot(input.day, input.window, s, now);
  const wanted = new Map<string, number>();
  for (const it of input.items) {
    const qty = Math.floor(Number(it.qty));
    if (!it.mealId || !Number.isFinite(qty) || qty < 1) throw new KitchenError("bad_items", "الكمية غير صالحة.", 400);
    wanted.set(it.mealId, (wanted.get(it.mealId) ?? 0) + qty);
  }
  if (wanted.size === 0) throw new KitchenError("empty_order", "ما في وجبات بالطلب.", 400);
  for (const qty of wanted.values()) {
    if (qty > MAX_QTY_PER_MEAL) throw new KitchenError("too_many", `أقصى كمية للوجبة الواحدة ${MAX_QTY_PER_MEAL}.`);
  }

  const { rows } = await tx.query(
    `SELECT mi.id, mi.restaurant_id, mi.name_ar, mi.price, r.name_ar AS kitchen_name, r.phone AS kitchen_phone, r.lat, r.lon
     FROM kitchen_meal_days kd
     JOIN menu_items mi ON mi.id = kd.menu_item_id
     JOIN restaurants r ON r.id = mi.restaurant_id
     WHERE r.kind = '${KITCHEN_KIND}' AND r.is_open AND mi.is_available AND kd.day = $1 AND mi.id = ANY($2::text[])`,
    [input.day, [...wanted.keys()]],
  );
  if (rows.length !== wanted.size) throw new KitchenError("meal_unavailable", "في وجبة ما عادت متوفرة لهاليوم.");

  // Reserve first: the guarded UPDATE is what makes two customers racing for the
  // last portion safe.
  for (const [mealId, qty] of wanted) {
    const r = await tx.query(
      `UPDATE kitchen_meal_days SET sold = sold + $3 WHERE menu_item_id = $1 AND day = $2 AND sold + $3 <= portions RETURNING sold`,
      [mealId, input.day, qty],
    );
    if (r.rows.length === 0) {
      const name = String(rows.find((x) => x["id"] === mealId)?.["name_ar"] ?? "");
      throw new KitchenError("sold_out", `خلصت حصص «${name}» لهاليوم.`);
    }
  }

  const byKitchen = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const k = String(r["restaurant_id"]);
    byKitchen.set(k, [...(byKitchen.get(k) ?? []), r]);
  }

  const pct = Math.max(0, Math.min(50, Math.round(input.discountPct ?? 0)));
  const placed: PlacedOrder[] = [];
  for (const [kitchenId, meals] of byKitchen) {
    const first = meals[0]!;
    const kitchenName = String(first["kitchen_name"] ?? "");
    const deliveryFee = await quote(
      { id: kitchenId, lat: numOrNull(first["lat"]), lon: numOrNull(first["lon"]) },
      { lat: input.lat, lon: input.lon },
    );
    const lines = meals.map((m) => {
      const qty = wanted.get(String(m["id"]))!;
      const unit = discounted(Math.round(Number(m["price"])), pct);
      return { mealId: String(m["id"]), nameAr: String(m["name_ar"]), qty, unit, total: unit * qty };
    });
    const itemsTotal = lines.reduce((a, l) => a + l.total, 0);
    const summary = lines.map((l) => (l.qty > 1 ? `${l.nameAr} × ${l.qty}` : l.nameAr)).join("، ");
    const orderText = `${kitchenName}: ${summary}`;
    const id = newId();
    await tx.query(
      `INSERT INTO orders (id, user_id, order_text, restaurant_name, restaurant_phone, restaurant_id, status,
                           address, destination_lat, destination_lon, delivery_fee, total_price, estimated_minutes,
                           order_type, scheduled_day, scheduled_window, placed_at, meal_subscription_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8,$9,$10,$11,30,'restaurant',$12,$13,$14,$15,$14,$14)`,
      [id, input.userId, orderText, kitchenName, String(first["kitchen_phone"] ?? ""), kitchenId,
        input.address, input.lat, input.lon, deliveryFee, itemsTotal, input.day, input.window, now.toISOString(), input.subscriptionId ?? null],
    );
    for (const [i, l] of lines.entries()) {
      await tx.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, name_ar, unit_price, qty, line_total) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`${id}_${i}`, id, l.mealId, l.nameAr, l.unit, l.qty, l.total],
      );
    }
    await tx.query(`INSERT INTO order_status_history (id, order_id, status, note) VALUES ($1,$2,'scheduled',NULL)`, [`${id}_scheduled`, id]);
    placed.push({ id, kitchenId, kitchenName, day: input.day, window: input.window, itemsTotal, deliveryFee, orderText });
  }
  return placed;
}

async function inTransaction<T>(work: (tx: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await work(client as unknown as Client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function assertRoom(tx: Client, userId: string, adding: number): Promise<void> {
  const { rows } = await tx.query(`SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1 AND status = 'scheduled'`, [userId]);
  if (Number(rows[0]?.["n"] ?? 0) + adding > MAX_SCHEDULED_PER_USER) {
    throw new KitchenError("too_many_scheduled", "عندك طلبات مجدولة كتير. استنّى لتوصل قبل ما تضيف غيرها.");
  }
}

export async function placeOrder(input: PlaceInput, quote: DeliveryQuote, now = new Date()): Promise<PlacedOrder[]> {
  const s = await getKitchenSettings();
  if (!s.enabled) throw new KitchenError("kitchen_disabled", "هالقسم مو متاح حالياً.", 404);
  return inTransaction(async (tx) => {
    await assertRoom(tx, input.userId, 1);
    return placeDayInTx(tx, { ...input, subscriptionId: null, discountPct: 0 }, s, quote, now);
  });
}

export interface SubscribeInput {
  userId: string;
  goal: SubscriptionGoal;
  window: string;
  address: string;
  lat: number;
  lon: number;
  days: { day: string; mealId: string }[];
}

export interface PlacedSubscription {
  id: string;
  discountPct: number;
  orders: PlacedOrder[];
  total: number;
}

/** A week of meals: one scheduled order per day, all or nothing, at the subscription discount. */
export async function placeSubscription(input: SubscribeInput, quote: DeliveryQuote, now = new Date()): Promise<PlacedSubscription> {
  const s = await getKitchenSettings();
  if (!s.enabled) throw new KitchenError("kitchen_disabled", "هالقسم مو متاح حالياً.", 404);
  if (!(SUBSCRIPTION_GOALS as readonly string[]).includes(input.goal)) throw new KitchenError("bad_goal", "الهدف غير صالح.", 400);
  const days = input.days.filter((d) => d && isDay(d.day) && d.mealId);
  if (new Set(days.map((d) => d.day)).size !== days.length) throw new KitchenError("duplicate_day", "كل يوم إله وجبة وحدة بالاشتراك.", 400);
  if (days.length < s.minSubscriptionDays) throw new KitchenError("too_few_days", `الاشتراك بدو ${s.minSubscriptionDays} أيام على الأقل.`);
  if (days.length > DAYS_AHEAD) throw new KitchenError("too_many_days", "عدد الأيام أكتر من المتاح.", 400);

  return inTransaction(async (tx) => {
    await assertRoom(tx, input.userId, days.length);
    const id = `sub_${newId()}`;
    await tx.query(
      `INSERT INTO meal_subscriptions (id, user_id, goal, days_count, discount_pct, delivery_window, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, input.userId, input.goal, days.length, s.subscriptionDiscountPct, input.window, now.toISOString()],
    );
    const orders: PlacedOrder[] = [];
    for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
      orders.push(...(await placeDayInTx(tx, {
        userId: input.userId, day: d.day, window: input.window, items: [{ mealId: d.mealId, qty: 1 }],
        address: input.address, lat: input.lat, lon: input.lon, subscriptionId: id, discountPct: s.subscriptionDiscountPct,
      }, s, quote, now)));
    }
    return { id, discountPct: s.subscriptionDiscountPct, orders, total: orders.reduce((a, o) => a + o.itemsTotal + o.deliveryFee, 0) };
  });
}

// ─── Cancelling ──────────────────────────────────────────────────────────────

async function cancelScheduledInTx(tx: Client, orderId: string, userId: string | null, note: string): Promise<Record<string, unknown> | null> {
  const upd = await tx.query(
    `UPDATE orders SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND status = 'scheduled' AND ($2::text IS NULL OR user_id = $2)
     RETURNING *, TO_CHAR(scheduled_day, 'YYYY-MM-DD') AS day_str`,
    [orderId, userId],
  );
  const order = upd.rows[0];
  if (!order) return null;
  // Give the portions back so someone else can have them.
  await tx.query(
    `UPDATE kitchen_meal_days kd SET sold = GREATEST(0, kd.sold - oi.qty)
     FROM order_items oi WHERE oi.order_id = $1 AND kd.menu_item_id = oi.menu_item_id AND kd.day = $2::date`,
    [orderId, String(order["day_str"])],
  );
  await tx.query(`INSERT INTO order_status_history (id, order_id, status, note) VALUES ($1,$2,'cancelled',$3)`, [`${orderId}_cancelled_${Date.now()}`, orderId, note]);
  return order;
}

/** Customer cancels a scheduled order. Allowed until that day's cutoff; afterwards the kitchen is already cooking. */
export async function cancelScheduledOrder(userId: string, orderId: string, now = new Date()): Promise<Record<string, unknown>> {
  const s = await getKitchenSettings();
  return inTransaction(async (tx) => {
    // Dates are read as text: a DATE parsed into a JS Date can shift a day across time zones.
    const { rows } = await tx.query(`SELECT TO_CHAR(scheduled_day, 'YYYY-MM-DD') AS day FROM orders WHERE id = $1 AND user_id = $2 AND status = 'scheduled'`, [orderId, userId]);
    if (!rows[0]) throw new KitchenError("not_found", "الطلب غير موجود.", 404);
    const day = String(rows[0]["day"]);
    if (!isDayOpen(day, s, now)) throw new KitchenError("too_late", "فات وقت الإلغاء، المطبخ بلّش يحضّر طلبك.", 409);
    const order = await cancelScheduledInTx(tx, orderId, userId, "customer_cancelled_scheduled");
    if (!order) throw new KitchenError("not_found", "الطلب غير موجود.", 404);
    return order;
  });
}

/** Cancels the subscription and every one of its orders that can still be cancelled. */
export async function cancelSubscription(userId: string, subscriptionId: string, now = new Date()): Promise<{ cancelled: number; kept: number }> {
  const s = await getKitchenSettings();
  return inTransaction(async (tx) => {
    const sub = await tx.query(`SELECT id FROM meal_subscriptions WHERE id = $1 AND user_id = $2`, [subscriptionId, userId]);
    if (!sub.rows[0]) throw new KitchenError("not_found", "الاشتراك غير موجود.", 404);
    const { rows } = await tx.query(`SELECT id, TO_CHAR(scheduled_day, 'YYYY-MM-DD') AS day FROM orders WHERE meal_subscription_id = $1 AND status = 'scheduled'`, [subscriptionId]);
    let cancelled = 0, kept = 0;
    for (const o of rows) {
      if (isDayOpen(String(o["day"]), s, now)) {
        if (await cancelScheduledInTx(tx, String(o["id"]), userId, "subscription_cancelled")) cancelled++;
      } else kept++;
    }
    await tx.query(`UPDATE meal_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [subscriptionId]);
    return { cancelled, kept };
  });
}

/** Admin cancel: no cutoff, used when a kitchen cannot cook. */
export async function adminCancelScheduled(orderId: string): Promise<Record<string, unknown> | null> {
  return inTransaction((tx) => cancelScheduledInTx(tx, orderId, null, "admin_cancelled"));
}

export async function listSubscriptions(userId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT s.id, s.goal, s.days_count AS "daysCount", s.discount_pct AS "discountPct", s.delivery_window AS "window",
            s.status, s.created_at AS "createdAt",
            COUNT(o.id) FILTER (WHERE o.status = 'scheduled')::int AS "upcoming",
            COUNT(o.id) FILTER (WHERE o.status = 'delivered')::int AS "delivered",
            COALESCE(json_agg(json_build_object('id', o.id, 'day', TO_CHAR(o.scheduled_day, 'YYYY-MM-DD'), 'status', o.status, 'text', o.order_text)
                              ORDER BY o.scheduled_day) FILTER (WHERE o.id IS NOT NULL), '[]') AS orders
     FROM meal_subscriptions s LEFT JOIN orders o ON o.meal_subscription_id = s.id
     WHERE s.user_id = $1 GROUP BY s.id ORDER BY s.created_at DESC LIMIT 20`,
    [userId],
  );
  return rows;
}

// ─── Releasing scheduled orders to couriers ──────────────────────────────────

export interface ReleaseHooks {
  dispatch: (orderId: string) => Promise<void> | void;
  notifyCustomer: (userId: string, order: Record<string, unknown>) => void;
}

/**
 * Moves every scheduled order whose window is about to start into the normal
 * flow. `created_at` becomes the release time so that everything measured from
 * it (courier wait, delivery duration, "today" counts, estimates) describes the
 * delivery itself; the moment the customer ordered is kept in `placed_at`.
 */
export async function releaseDueOrders(hooks: ReleaseHooks, now = new Date()): Promise<string[]> {
  const s = await getKitchenSettings();
  const { rows } = await pool.query(
    `SELECT id, TO_CHAR(scheduled_day, 'YYYY-MM-DD') AS day, scheduled_window AS win FROM orders
     WHERE status = 'scheduled' AND scheduled_day <= ($1::date + 1) ORDER BY scheduled_day LIMIT 200`,
    [damascusDay(now)],
  );
  const released: string[] = [];
  for (const o of rows) {
    const win = String(o["win"] ?? "");
    if (!WINDOW_RE.test(win)) continue;
    if (releaseAt(String(o["day"]), win, s).getTime() > now.getTime()) continue;
    const upd = await pool.query(
      `UPDATE orders SET status = 'searching', placed_at = COALESCE(placed_at, created_at), created_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'scheduled' RETURNING *`,
      [o["id"]],
    );
    const order = upd.rows[0];
    if (!order) continue;
    const id = String(order["id"]);
    await pool.query(`INSERT INTO order_status_history (id, order_id, status, note) VALUES ($1,$2,'searching','scheduled_release') ON CONFLICT (id) DO NOTHING`, [`${id}_released`, id]);
    released.push(id);
    try {
      hooks.notifyCustomer(String(order["user_id"]), order);
      await hooks.dispatch(id);
    } catch (err) {
      // The dispatch job rescans searching orders, so a failed kick is recovered there.
      logger.warn({ err, orderId: id }, "[kitchen] release hook failed");
    }
  }
  return released;
}

// ─── Kitchen summaries ───────────────────────────────────────────────────────

export interface KitchenDaySummary {
  kitchenId: string;
  kitchenName: string;
  phone: string;
  day: string;
  orders: number;
  lines: { nameAr: string; qty: number }[];
  byWindow: { window: string; orders: number }[];
}

/** What each kitchen has to cook for `day`: totals per meal and how many deliveries per window. */
export async function getDaySummaries(day: string): Promise<KitchenDaySummary[]> {
  const { rows } = await pool.query(
    `SELECT o.restaurant_id AS kid, r.name_ar AS kname, COALESCE(r.phone, '') AS phone, o.id, o.scheduled_window AS win, oi.name_ar, oi.qty
     FROM orders o JOIN restaurants r ON r.id = o.restaurant_id JOIN order_items oi ON oi.order_id = o.id
     WHERE o.scheduled_day = $1::date AND o.status NOT IN ('cancelled') AND r.kind = '${KITCHEN_KIND}'`,
    [day],
  );
  const map = new Map<string, { s: KitchenDaySummary; orders: Map<string, string>; meals: Map<string, number> }>();
  for (const r of rows) {
    const kid = String(r["kid"]);
    let e = map.get(kid);
    if (!e) {
      e = { s: { kitchenId: kid, kitchenName: String(r["kname"]), phone: String(r["phone"]), day, orders: 0, lines: [], byWindow: [] }, orders: new Map(), meals: new Map() };
      map.set(kid, e);
    }
    e.orders.set(String(r["id"]), String(r["win"] ?? ""));
    e.meals.set(String(r["name_ar"]), (e.meals.get(String(r["name_ar"])) ?? 0) + Number(r["qty"]));
  }
  return [...map.values()].map(({ s, orders, meals }) => {
    const wins = new Map<string, number>();
    for (const w of orders.values()) wins.set(w, (wins.get(w) ?? 0) + 1);
    return {
      ...s,
      orders: orders.size,
      lines: [...meals].map(([nameAr, qty]) => ({ nameAr, qty })).sort((a, b) => b.qty - a.qty),
      byWindow: [...wins].map(([window, n]) => ({ window, orders: n })).sort((a, b) => a.window.localeCompare(b.window)),
    };
  });
}

export function summaryText(s: KitchenDaySummary): string {
  return [
    `🍲 *طلبات بكرا (${s.day})*`,
    `${s.kitchenName} · ${s.orders} طلب`,
    "",
    ...s.lines.map((l) => `• ${l.nameAr} × ${l.qty}`),
    "",
    "مواعيد التسليم للمندوب:",
    ...s.byWindow.map((w) => `• ${windowLabel(w.window)} : ${w.orders} طلب`),
    "",
    "باب الطلب سكّر، وهاد العدد النهائي. يعطيكي العافية.",
  ].join("\n");
}

/**
 * After the cutoff, tells each kitchen once what to cook tomorrow. `send` is the
 * WhatsApp sender; a marker in system_settings keeps a restart from re-sending.
 */
export async function sendCutoffSummaries(send: (phone: string, text: string) => Promise<boolean>, now = new Date()): Promise<number> {
  const s = await getKitchenSettings();
  if (!s.enabled) return 0;
  const tomorrow = addDays(damascusDay(now), 1);
  if (isDayOpen(tomorrow, s, now)) return 0;
  const claim = await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ('kitchen_last_summary_day', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE system_settings.value IS DISTINCT FROM EXCLUDED.value RETURNING value`,
    [tomorrow],
  );
  if (claim.rows.length === 0) return 0;
  let sent = 0;
  for (const summary of await getDaySummaries(tomorrow)) {
    if (!summary.phone) continue;
    if (await send(summary.phone, summaryText(summary)).catch(() => false)) sent++;
  }
  return sent;
}

export function startKitchenJob(hooks: ReleaseHooks, send: (phone: string, text: string) => Promise<boolean>): void {
  const tick = async () => {
    try {
      await releaseDueOrders(hooks);
      await sendCutoffSummaries(send);
    } catch (err) {
      logger.warn({ err }, "[kitchen] job tick failed");
    }
  };
  void tick();
  setInterval(() => void tick(), 60_000).unref();
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminOverview(now = new Date()) {
  const s = await getKitchenSettings();
  const days = listDays(s, now).map((d) => d.day);
  const [kitchens, others, meals, mealDays, upcoming, subs] = await Promise.all([
    pool.query(`SELECT id, name_ar AS "nameAr", phone, is_open AS "isOpen", rating, lat, lon FROM restaurants WHERE kind = '${KITCHEN_KIND}' ORDER BY name_ar`),
    pool.query(`SELECT id, name_ar AS "nameAr" FROM restaurants WHERE kind <> '${KITCHEN_KIND}' ORDER BY name_ar`),
    pool.query(
      `SELECT mi.id, mi.restaurant_id AS "kitchenId", mi.name_ar AS "nameAr", mi.price, mi.image, mi.is_available AS "isAvailable",
              mi.meal_section AS section, mi.calories, mi.protein_g AS "proteinG", mi.carbs_g AS "carbsG", mi.fat_g AS "fatG", mi.health_tags AS tags
       FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id WHERE r.kind = '${KITCHEN_KIND}' ORDER BY mi.name_ar`),
    pool.query(
      `SELECT menu_item_id AS "mealId", TO_CHAR(day, 'YYYY-MM-DD') AS day, portions, sold FROM kitchen_meal_days WHERE day >= $1::date ORDER BY day`,
      [days[0]]),
    pool.query(
      `SELECT TO_CHAR(scheduled_day, 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders, COALESCE(SUM(total_price), 0)::int AS total
       FROM orders WHERE status = 'scheduled' GROUP BY 1 ORDER BY 1`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active, COUNT(*)::int AS total FROM meal_subscriptions`),
  ]);
  return {
    settings: s,
    days: listDays(s, now),
    kitchens: kitchens.rows,
    otherRestaurants: others.rows,
    meals: meals.rows.map((m) => ({ ...m, price: Math.round(Number(m["price"])), tags: tagList(m["tags"]) })),
    mealDays: mealDays.rows,
    upcoming: upcoming.rows,
    subscriptions: subs.rows[0] ?? { active: 0, total: 0 },
  };
}

export async function setRestaurantKind(restaurantId: string, kitchen: boolean): Promise<boolean> {
  const r = await pool.query(`UPDATE restaurants SET kind = $2 WHERE id = $1 RETURNING id`, [restaurantId, kitchen ? KITCHEN_KIND : "restaurant"]);
  return r.rows.length > 0;
}

export interface MealNutritionInput {
  section?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  tags?: string[];
}

const nn = (v: unknown, max: number): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

export async function updateMealNutrition(mealId: string, input: MealNutritionInput): Promise<boolean> {
  const section = (MEAL_SECTIONS as readonly string[]).includes(String(input.section)) ? String(input.section) : "home";
  const tags = (input.tags ?? []).map((t) => String(t).replace(/,/g, " ").trim()).filter(Boolean).slice(0, 6).join(",");
  const r = await pool.query(
    `UPDATE menu_items mi SET meal_section = $2, calories = $3, protein_g = $4, carbs_g = $5, fat_g = $6, health_tags = $7
     FROM restaurants r WHERE mi.id = $1 AND r.id = mi.restaurant_id AND r.kind = '${KITCHEN_KIND}' RETURNING mi.id`,
    [mealId, section, nn(input.calories, 5000) == null ? null : Math.round(nn(input.calories, 5000)!), nn(input.proteinG, 500), nn(input.carbsG, 800), nn(input.fatG, 500), tags],
  );
  return r.rows.length > 0;
}

/**
 * Sets how many portions of a meal exist on a day. Never below what is already
 * sold; zero removes the day when nothing was sold. `kitchenId` restricts the
 * change to that kitchen's own meals (the cook's portal).
 */
export async function setMealDay(mealId: string, day: string, portions: number, kitchenId?: string): Promise<{ portions: number; sold: number } | null> {
  if (!isDay(day)) return null;
  const want = Math.max(0, Math.min(500, Math.floor(Number(portions) || 0)));
  const own = await pool.query(
    `SELECT mi.id FROM menu_items mi JOIN restaurants r ON r.id = mi.restaurant_id
     WHERE mi.id = $1 AND r.kind = '${KITCHEN_KIND}' AND ($2::text IS NULL OR r.id = $2)`,
    [mealId, kitchenId ?? null],
  );
  if (own.rows.length === 0) return null;
  if (want === 0) {
    const del = await pool.query(`DELETE FROM kitchen_meal_days WHERE menu_item_id = $1 AND day = $2::date AND sold = 0 RETURNING 1`, [mealId, day]);
    if (del.rows.length > 0) return { portions: 0, sold: 0 };
    const cur = await pool.query(`UPDATE kitchen_meal_days SET portions = sold WHERE menu_item_id = $1 AND day = $2::date RETURNING portions, sold`, [mealId, day]);
    return cur.rows[0] ? { portions: Number(cur.rows[0]["portions"]), sold: Number(cur.rows[0]["sold"]) } : { portions: 0, sold: 0 };
  }
  const r = await pool.query(
    `INSERT INTO kitchen_meal_days (menu_item_id, day, portions) VALUES ($1, $2::date, $3)
     ON CONFLICT (menu_item_id, day) DO UPDATE SET portions = GREATEST(EXCLUDED.portions, kitchen_meal_days.sold)
     RETURNING portions, sold`,
    [mealId, day, want],
  );
  return { portions: Number(r.rows[0]!["portions"]), sold: Number(r.rows[0]!["sold"]) };
}

export async function listScheduledOrders(day: string): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(
    `SELECT o.id, o.status, o.order_text AS "orderText", o.restaurant_name AS "kitchenName", o.address,
            o.scheduled_window AS "window", o.total_price AS "totalPrice", o.delivery_fee AS "deliveryFee",
            o.meal_subscription_id AS "subscriptionId", u.name AS "customerName", u.phone AS "customerPhone"
     FROM orders o LEFT JOIN users u ON u.id = o.user_id
     WHERE o.scheduled_day = $1::date ORDER BY o.scheduled_window, o.restaurant_name`,
    [day],
  );
  return rows;
}

/** For the cook's portal: their meals and portions for the coming days. */
export async function kitchenPortalDays(kitchenId: string, now = new Date()) {
  const s = await getKitchenSettings();
  const days = listDays(s, now);
  const [meals, mealDays] = await Promise.all([
    pool.query(`SELECT id, name_ar AS "nameAr", price, image, is_available AS "isAvailable" FROM menu_items WHERE restaurant_id = $1 ORDER BY name_ar`, [kitchenId]),
    pool.query(
      `SELECT kd.menu_item_id AS "mealId", TO_CHAR(kd.day, 'YYYY-MM-DD') AS day, kd.portions, kd.sold
       FROM kitchen_meal_days kd JOIN menu_items mi ON mi.id = kd.menu_item_id
       WHERE mi.restaurant_id = $1 AND kd.day >= $2::date`,
      [kitchenId, days[0]!.day]),
  ]);
  return { days, meals: meals.rows, mealDays: mealDays.rows, summaries: await Promise.all(days.slice(0, 2).map((d) => getDaySummaries(d.day).then((l) => l.find((x) => x.kitchenId === kitchenId) ?? null))) };
}
