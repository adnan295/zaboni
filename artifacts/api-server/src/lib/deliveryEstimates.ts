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
  sample: number;
  byRestaurantId: Record<string, RestaurantLearned>;
}

export const EMPTY_LEARNED: LearnedTimes = { wait: null, pickup: null, minutesPerKm: null, sample: 0, byRestaurantId: {} };

/** Below this many delivered orders an average is noise, so the fallback is used. */
export const MIN_SAMPLE = 5;
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
    SELECT o.restaurant_id,
           EXTRACT(EPOCH FROM (h.accepted_at  - o.created_at))   / 60 AS wait_m,
           EXTRACT(EPOCH FROM (h.picked_up_at - h.accepted_at))  / 60 AS pickup_m,
           EXTRACT(EPOCH FROM (h.delivered_at - h.picked_up_at)) / 60 AS ride_m,
           EXTRACT(EPOCH FROM (h.delivered_at - o.created_at))   / 60 AS total_m,
           CASE WHEN r.lat IS NOT NULL AND r.lon IS NOT NULL AND o.destination_lat IS NOT NULL AND o.destination_lon IS NOT NULL
                THEN ${KM_SQL("r.lat", "r.lon", "o.destination_lat", "o.destination_lon")} END AS km
    FROM orders o
    JOIN h ON h.order_id = o.id
    LEFT JOIN restaurants r ON r.id = o.restaurant_id
    WHERE o.status = 'delivered' AND o.created_at >= NOW() - make_interval(days => ${WINDOW_DAYS}))`;

const ok = (col: string, max = MAX_STEP_MINUTES) => `${col} BETWEEN 0 AND ${max}`;

export async function loadLearnedTimes(): Promise<LearnedTimes> {
  const [overall, perRestaurant] = await Promise.all([
    pool.query(`${STEPS_SQL}
      SELECT COUNT(*) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)})::int AS sample,
             AVG(wait_m)   FILTER (WHERE ${ok("wait_m")})   AS wait,
             AVG(pickup_m) FILTER (WHERE ${ok("pickup_m")}) AS pickup,
             SUM(ride_m) FILTER (WHERE ${ok("ride_m")} AND km BETWEEN 0.3 AND 30)
               / NULLIF(SUM(km) FILTER (WHERE ${ok("ride_m")} AND km BETWEEN 0.3 AND 30), 0) AS min_per_km
      FROM t`),
    pool.query(`${STEPS_SQL}
      SELECT restaurant_id AS id,
             COUNT(*) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)})::int AS sample,
             AVG(pickup_m) FILTER (WHERE ${ok("pickup_m")}) AS pickup,
             PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_m) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)}) AS low,
             PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_m) FILTER (WHERE ${ok("total_m", MAX_STEP_MINUTES * 2)}) AS high
      FROM t WHERE restaurant_id IS NOT NULL GROUP BY restaurant_id`),
  ]);
  const o = overall.rows[0] ?? {};
  const sample = Number(o["sample"] ?? 0);
  const enough = sample >= MIN_SAMPLE;
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const byRestaurantId: Record<string, RestaurantLearned> = {};
  for (const r of perRestaurant.rows) {
    if (Number(r["sample"]) < MIN_SAMPLE || r["low"] == null || r["high"] == null) continue;
    byRestaurantId[String(r["id"])] = {
      pickup: Number(r["pickup"] ?? FALLBACK_PICKUP), totalLow: Number(r["low"]), totalHigh: Number(r["high"]), sample: Number(r["sample"]),
    };
  }
  return {
    wait: enough ? num(o["wait"]) : null,
    pickup: enough ? num(o["pickup"]) : null,
    // Guard against a nonsense pace from a handful of odd rides.
    minutesPerKm: enough && o["min_per_km"] != null ? Math.min(12, Math.max(1.5, Number(o["min_per_km"]))) : null,
    sample,
    byRestaurantId,
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
const rideMinutes = (km: number, l: LearnedTimes) => Math.max(2, (Number.isFinite(km) ? Math.max(0, km) : 0) * (l.minutesPerKm ?? FALLBACK_MIN_PER_KM));

/** Estimate stored on a new order: wait for a courier + pickup at this restaurant + the ride. */
export function estimateOrderMinutes(distanceKm: number, restaurantId: string | null | undefined, l: LearnedTimes): number {
  const km = Number.isFinite(distanceKm) ? distanceKm : 0;
  if (l.sample < MIN_SAMPLE) return clamp(15 + Math.round(km * 4), 15, 120);
  const pickup = (restaurantId && l.byRestaurantId[restaurantId]?.pickup) || l.pickup || FALLBACK_PICKUP;
  const total = (l.wait ?? FALLBACK_WAIT) + pickup + rideMinutes(km, l);
  return clamp(Math.ceil(total / 5) * 5, 10, 120);
}

/** "25-35" for a restaurant card, or null to keep the admin-entered text. */
export function restaurantDeliveryRange(restaurantId: string, l: LearnedTimes): string | null {
  const r = l.byRestaurantId[restaurantId];
  if (!r) return null;
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
    const pickup = (input.restaurantId && l.byRestaurantId[input.restaurantId]?.pickup) || l.pickup || FALLBACK_PICKUP;
    const fromKm = km(restaurant) ?? km(courier);
    if (fromKm == null) return null;
    return Math.max(2, Math.round(Math.max(2, pickup - elapsed) + rideMinutes(fromKm, l)));
  }
  if (input.status === "picked_up" || input.status === "on_way") {
    const live = km(courier);
    if (live != null) return Math.max(1, Math.round(rideMinutes(live, l)));
    // No trustworthy position: count down the usual ride from the restaurant instead of freezing.
    const fromKm = km(restaurant);
    if (fromKm == null) return null;
    return Math.max(2, Math.round(rideMinutes(fromKm, l) - elapsed));
  }
  return null;
}
