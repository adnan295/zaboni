// Delivery-time estimates the customer sees, learned from what deliveries really
// took over the last 30 days instead of a fixed guess:
//   - the "25-35 دقيقة" on a restaurant card,
//   - the estimate stored on a new order,
//   - the live ETA on the tracking screen.
// With no history yet (new restaurant, fresh install) every function falls back
// to the previous distance-only formula, so nothing gets worse.

import { pool } from "@workspace/db";

export interface RestaurantLearned {
  /** Courier accepted → collected, minutes. */
  pickup: number;
  /** Order placed → delivered: the middle half of real deliveries. */
  totalLow: number;
  totalHigh: number;
  sample: number;
}

export interface LearnedTimes {
  /** Order placed → a courier accepted. */
  wait: number | null;
  pickup: number | null;
  /** Riding minutes per straight-line km, restaurant → customer. */
  minutesPerKm: number | null;
  /**
   * Fixed minutes of every ride whatever its length: leaving the restaurant,
   * parking, finding the door, handing over. Absent on older data → 0.
   */
  rideFixed?: number | null;
  sample: number;
  byRestaurantId: Record<string, RestaurantLearned>;
  /** How this courier rides compared with everyone (1 = average, 1.3 = 30% slower). */
  courierPace?: Record<string, number>;
  /** How long pickups take at each Damascus hour compared with the day's average. */
  pickupByHour?: number[];
}

export const EMPTY_LEARNED: LearnedTimes = { wait: null, pickup: null, minutesPerKm: null, rideFixed: null, sample: 0, byRestaurantId: {}, courierPace: {}, pickupByHour: [] };

/** Below this many delivered orders an average is noise, so the fallback is used. */
export const MIN_SAMPLE = 5;
/**
 * Shrinkage: a restaurant or courier with n orders is trusted n/(n+K) and the
 * rest comes from everyone's average, so two odd orders cannot swing a quote
 * while a busy restaurant soon speaks for itself.
 */
const SHRINK_RESTAURANT = 3;
const SHRINK_COURIER = 5;
const SHRINK_HOUR = 10;
/** Recent deliveries count more: weight halves roughly every 10 days. */
const RECENCY_DAYS = 14;
/** Delivered within this many minutes of ordering = a captain's practice order. */
export const PRACTICE_ORDER_MAX_MINUTES = 5;
const FALLBACK_WAIT = 3;
const FALLBACK_PICKUP = 12;
const FALLBACK_MIN_PER_KM = 4;
const WINDOW_DAYS = 30;
const MAX_STEP_MINUTES = 180;
const CACHE_MS = 10 * 60 * 1000;

const KM_SQL = (aLat: string, aLon: string, bLat: string, bLon: string) => `
  (6371 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(${bLat} - ${aLat}) / 2), 2) +
    COS(RADIANS(${aLat})) * COS(RADIANS(${bLat})) * POWER(SIN(RADIANS(${bLon} - ${aLon}) / 2), 2))))`;

const STEPS_SQL = `
  WITH h AS (
    SELECT order_id,
           MAX(created_at) FILTER (WHERE status = 'accepted')  AS accepted_at,
           MAX(created_at) FILTER (WHERE status = 'picked_up') AS picked_up_at,
           MAX(created_at) FILTER (WHERE status = 'delivered') AS delivered_at
    FROM order_status_history GROUP BY order_id),
  t AS (
    SELECT o.restaurant_id, o.courier_id,
           EXTRACT(HOUR FROM h.accepted_at AT TIME ZONE 'Asia/Damascus')::int AS hour,
           EXP(-EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 86400 / ${RECENCY_DAYS}) AS w,
           EXTRACT(EPOCH FROM (h.accepted_at  - o.created_at))   / 60 AS wait_m,
           EXTRACT(EPOCH FROM (h.picked_up_at - h.accepted_at))  / 60 AS pickup_m,
           EXTRACT(EPOCH FROM (h.delivered_at - h.picked_up_at)) / 60 AS ride_m,
           EXTRACT(EPOCH FROM (h.delivered_at - o.created_at))   / 60 AS total_m,
           CASE WHEN r.lat IS NOT NULL AND r.lon IS NOT NULL AND o.destination_lat IS NOT NULL AND o.destination_lon IS NOT NULL
                THEN ${KM_SQL("r.lat", "r.lon", "o.destination_lat", "o.destination_lon")} END AS km
    FROM orders o
    JOIN h ON h.order_id = o.id
    LEFT JOIN restaurants r ON r.id = o.restaurant_id
    WHERE o.status = 'delivered' AND o.created_at >= NOW() - make_interval(days => ${WINDOW_DAYS})
      -- Practice orders a captain completes on the spot would teach "2 minutes".
      AND h.delivered_at - o.created_at > make_interval(mins => ${PRACTICE_ORDER_MAX_MINUTES}))`;

const ok = (col: string, max = MAX_STEP_MINUTES) => `${col} BETWEEN 0 AND ${max}`;

const wavg = (col: string, cond: string) => `SUM(w * ${col}) FILTER (WHERE ${cond}) / NULLIF(SUM(w) FILTER (WHERE ${cond}), 0)`;
const RIDE_OK = `${ok("ride_m", 60)} AND ride_m >= 1 AND km BETWEEN 0.2 AND 30`;

export async function loadLearnedTimes(): Promise<LearnedTimes> {
  const [overall, perRestaurant, perCourier, perHour] = await Promise.all([
    pool.query(`${STEPS_SQL}
      SELECT COUNT(*) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)})::int AS sample,
             ${wavg("wait_m", ok("wait_m"))}     AS wait,
             ${wavg("pickup_m", ok("pickup_m"))} AS pickup,
             COUNT(*) FILTER (WHERE ${RIDE_OK})::int AS rides,
             REGR_SLOPE(ride_m, km)     FILTER (WHERE ${RIDE_OK}) AS slope,
             REGR_INTERCEPT(ride_m, km) FILTER (WHERE ${RIDE_OK}) AS fixed
      FROM t`),
    pool.query(`${STEPS_SQL}
      SELECT restaurant_id AS id,
             COUNT(*) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)})::int AS sample,
             COUNT(*) FILTER (WHERE ${ok("pickup_m")})::int AS pickups,
             ${wavg("pickup_m", ok("pickup_m"))} AS pickup,
             PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_m) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)}) AS low,
             PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_m) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)}) AS high
      FROM t WHERE restaurant_id IS NOT NULL GROUP BY restaurant_id`),
    pool.query(`${STEPS_SQL}
      SELECT courier_id AS id, COUNT(*)::int AS n, SUM(ride_m) AS ride, SUM(km) AS km
      FROM t WHERE courier_id IS NOT NULL AND courier_id <> '' AND ${RIDE_OK} GROUP BY courier_id`),
    pool.query(`${STEPS_SQL}
      SELECT hour, COUNT(*)::int AS n, ${wavg("pickup_m", ok("pickup_m"))} AS pickup
      FROM t WHERE hour IS NOT NULL AND ${ok("pickup_m")} GROUP BY hour`),
  ]);
  const o = overall.rows[0] ?? {};
  const sample = Number(o["sample"] ?? 0);
  const enough = sample >= MIN_SAMPLE;
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const globalPickup = enough ? num(o["pickup"]) : null;

  // Ride = fixed + slope × km, fitted on real rides. Guarded so a handful of odd
  // rides cannot produce a negative or absurd line.
  const rides = Number(o["rides"] ?? 0);
  const fitted = enough && rides >= MIN_SAMPLE * 2 && o["slope"] != null && o["fixed"] != null;
  const minutesPerKm = fitted ? clamp(Number(o["slope"]), 1, 10) : null;
  const rideFixed = fitted ? clamp(Number(o["fixed"]), 2, 15) : null;

  const byRestaurantId: Record<string, RestaurantLearned> = {};
  for (const r of perRestaurant.rows) {
    const n = Number(r["pickups"] ?? 0);
    if (n === 0 || r["pickup"] == null) continue;
    const own = Number(r["pickup"]);
    const pickup = globalPickup == null ? own : (n * own + SHRINK_RESTAURANT * globalPickup) / (n + SHRINK_RESTAURANT);
    byRestaurantId[String(r["id"])] = {
      pickup, totalLow: Number(r["low"]), totalHigh: Number(r["high"]), sample: Number(r["sample"]),
    };
  }

  const courierPace: Record<string, number> = {};
  if (minutesPerKm != null && rideFixed != null) {
    for (const r of perCourier.rows) {
      const n = Number(r["n"]);
      const expected = n * rideFixed + minutesPerKm * Number(r["km"]);
      if (!(n > 0 && expected > 0)) continue;
      const own = Number(r["ride"]) / expected;
      courierPace[String(r["id"])] = clamp((n * own + SHRINK_COURIER) / (n + SHRINK_COURIER), 0.6, 1.6);
    }
  }

  const pickupByHour: number[] = [];
  if (globalPickup) {
    for (const r of perHour.rows) {
      const n = Number(r["n"]);
      const ratio = Number(r["pickup"]) / globalPickup;
      if (!(n > 0 && Number.isFinite(ratio))) continue;
      pickupByHour[Number(r["hour"])] = clamp((n * ratio + SHRINK_HOUR) / (n + SHRINK_HOUR), 0.7, 1.5);
    }
  }

  return {
    wait: enough ? num(o["wait"]) : null,
    pickup: globalPickup,
    minutesPerKm,
    rideFixed,
    sample,
    byRestaurantId,
    courierPace,
    pickupByHour,
  };
}

let cache: { at: number; value: LearnedTimes } | null = null;
let inflight: Promise<LearnedTimes> | null = null;

/** Cached for 10 minutes; never throws — an estimate must not break ordering. */
export async function getLearnedTimes(): Promise<LearnedTimes> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (!inflight) {
    inflight = loadLearnedTimes()
      .then((value) => { cache = { at: Date.now(), value }; return value; })
      .catch(() => cache?.value ?? EMPTY_LEARNED)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/**
 * Minutes for a ride of `km`. `remaining` = the courier is already moving, so
 * only the arrival half of the fixed time is still ahead.
 */
const rideMinutes = (km: number, l: LearnedTimes, courierId?: string | null, remaining = false) => {
  const d = Number.isFinite(km) ? Math.max(0, km) : 0;
  const fixed = (l.rideFixed ?? 0) * (remaining ? 0.5 : 1);
  const pace = (courierId && l.courierPace?.[courierId]) || 1;
  return Math.max(2, (fixed + d * (l.minutesPerKm ?? FALLBACK_MIN_PER_KM)) * pace);
};

const damascusHour = (at: Date) => (at.getUTCHours() + 3) % 24;

/** This restaurant's usual pickup, adjusted for how busy this hour of the day runs. */
const pickupMinutes = (restaurantId: string | null | undefined, l: LearnedTimes, at: Date) => {
  const base = (restaurantId && l.byRestaurantId[restaurantId]?.pickup) || l.pickup || FALLBACK_PICKUP;
  return base * (l.pickupByHour?.[damascusHour(at)] || 1);
};

/** Estimate stored on a new order: wait for a courier + pickup at this restaurant + the ride. */
export function estimateOrderMinutes(distanceKm: number, restaurantId: string | null | undefined, l: LearnedTimes, now = new Date()): number {
  const km = Number.isFinite(distanceKm) ? distanceKm : 0;
  if (l.sample < MIN_SAMPLE) return clamp(15 + Math.round(km * 4), 15, 120);
  const pickup = pickupMinutes(restaurantId, l, now);
  const total = (l.wait ?? FALLBACK_WAIT) + pickup + rideMinutes(km, l);
  return clamp(Math.ceil(total / 5) * 5, 10, 120);
}

/** "25-35" for a restaurant card, or null to keep the admin-entered text. */
export function restaurantDeliveryRange(restaurantId: string, l: LearnedTimes): string | null {
  const r = l.byRestaurantId[restaurantId];
  if (!r || r.sample < MIN_SAMPLE || !Number.isFinite(r.totalLow) || !Number.isFinite(r.totalHigh)) return null;
  const low = clamp(roundTo5(r.totalLow), 10, 115);
  const high = clamp(Math.max(low + 5, roundTo5(r.totalHigh)), low + 5, 120);
  return `${low}-${high}`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Point = { lat: number; lon: number } | null;

/** Minutes left, for the tracking screen. */
export function liveEtaMinutes(input: {
  status: string;
  /** When the order entered its current status. */
  statusSince: Date;
  courier: Point;
  /** False when the courier's last fix is too old to trust. */
  courierFresh: boolean;
  restaurant: Point;
  destination: Point;
  restaurantId?: string | null;
  /** The assigned courier: their own riding pace is used once known. */
  courierId?: string | null;
  now?: Date;
}, l: LearnedTimes): number | null {
  const { destination, restaurant } = input;
  if (!destination) return null;
  const now = input.now ?? new Date();
  const elapsed = Math.max(0, (now.getTime() - input.statusSince.getTime()) / 60000);
  const courier = input.courierFresh ? input.courier : null;
  const km = (a: Point) => (a ? haversineKm(a.lat, a.lon, destination.lat, destination.lon) : null);

  if (input.status === "accepted") {
    // Still has to collect the order: what is left of this restaurant's usual pickup time, then the ride from it.
    const pickup = pickupMinutes(input.restaurantId, l, input.statusSince);
    const fromKm = km(restaurant) ?? km(courier);
    if (fromKm == null) return null;
    return Math.max(2, Math.round(Math.max(2, pickup - elapsed) + rideMinutes(fromKm, l, input.courierId)));
  }
  if (input.status === "picked_up" || input.status === "on_way") {
    const live = km(courier);
    if (live != null) return Math.max(1, Math.round(rideMinutes(live, l, input.courierId, true)));
    // No trustworthy position: count down the usual ride from the restaurant instead of freezing.
    const fromKm = km(restaurant);
    if (fromKm == null) return null;
    return Math.max(2, Math.round(rideMinutes(fromKm, l, input.courierId) - elapsed));
  }
  return null;
}

// ─── Promises ────────────────────────────────────────────────────────────────
// When a courier accepts, the arrival time the customer is shown is written
// down once, so the admin can see how often we keep our word and whether the
// learning is actually getting better.

let promisesReady: Promise<void> | null = null;
function ensurePromises(): Promise<void> {
  promisesReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS order_eta_promises (
      order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      promised_minutes INTEGER NOT NULL,
      promised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      promised_by TIMESTAMPTZ NOT NULL
    )`).then(() => undefined).catch((err) => { promisesReady = null; throw err; });
  return promisesReady;
}

/** Records the promise for a just-accepted order. Never throws: it must not affect the accept. */
export async function recordPromisedEta(orderId: string, now = new Date()): Promise<number | null> {
  try {
    await ensurePromises();
    const { rows } = await pool.query(
      `SELECT o.restaurant_id, o.courier_id, o.destination_lat, o.destination_lon, COALESCE(r.lat, o.pickup_lat) AS r_lat, COALESCE(r.lon, o.pickup_lon) AS r_lon
       FROM orders o LEFT JOIN restaurants r ON r.id = o.restaurant_id WHERE o.id = $1`, [orderId]);
    const o = rows[0];
    if (!o) return null;
    const pt = (lat: unknown, lon: unknown): Point => (lat == null || lon == null ? null : { lat: Number(lat), lon: Number(lon) });
    const minutes = liveEtaMinutes({
      status: "accepted", statusSince: now, now,
      courier: null, courierFresh: false,
      restaurant: pt(o["r_lat"], o["r_lon"]),
      destination: pt(o["destination_lat"], o["destination_lon"]),
      restaurantId: o["restaurant_id"] ?? null,
      courierId: o["courier_id"] ?? null,
    }, await getLearnedTimes());
    if (minutes == null) return null;
    await pool.query(
      `INSERT INTO order_eta_promises (order_id, promised_minutes, promised_at, promised_by)
       VALUES ($1, $2, $3, $3::timestamptz + make_interval(mins => $2)) ON CONFLICT (order_id) DO NOTHING`,
      [orderId, minutes, now.toISOString()]);
    return minutes;
  } catch {
    return null;
  }
}
