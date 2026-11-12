// How long each order actually took, from the status history the order state
// machine already writes: waiting for a courier, the courier reaching/collecting
// the order, and the ride to the customer.

import { pool } from "@workspace/db";

export interface OrderTiming {
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  /** Order placed → a courier accepted it. */
  waitMinutes: number | null;
  /** Courier accepted → collected the order. */
  pickupMinutes: number | null;
  /** Courier accepted → handed to the customer. The number the admin asks about. */
  deliveryMinutes: number | null;
  /** Order placed → handed to the customer (what the customer felt). */
  totalMinutes: number | null;
}

const minutesBetween = (from: Date | null, to: Date | null): number | null =>
  from && to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000)) : null;

const toDate = (v: unknown): Date | null => (v == null ? null : new Date(v as string));

/** Timings for the given orders. `createdAt` is supplied by the caller, which already has the rows. */
export async function getOrderTimings(orders: { id: string; createdAt: Date | string }[]): Promise<Record<string, OrderTiming>> {
  const out: Record<string, OrderTiming> = {};
  if (orders.length === 0) return out;
  // The LAST "accepted" row is the courier who actually delivered: when a courier
  // drops an order it goes back to searching and is accepted again by another one.
  const { rows } = await pool.query(
    `SELECT order_id,
            MAX(created_at) FILTER (WHERE status = 'accepted')  AS accepted_at,
            MAX(created_at) FILTER (WHERE status = 'picked_up') AS picked_up_at,
            MAX(created_at) FILTER (WHERE status = 'delivered') AS delivered_at
     FROM order_status_history
     WHERE order_id = ANY($1::text[])
     GROUP BY order_id`,
    [orders.map((o) => o.id)],
  );
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) byId.set(String(r.order_id), r);
  for (const o of orders) {
    const r = byId.get(o.id);
    const created = new Date(o.createdAt);
    const accepted = toDate(r?.["accepted_at"]);
    const pickedUp = toDate(r?.["picked_up_at"]);
    const delivered = toDate(r?.["delivered_at"]);
    out[o.id] = {
      acceptedAt: accepted?.toISOString() ?? null,
      pickedUpAt: pickedUp?.toISOString() ?? null,
      deliveredAt: delivered?.toISOString() ?? null,
      waitMinutes: minutesBetween(created, accepted),
      pickupMinutes: minutesBetween(accepted, pickedUp),
      deliveryMinutes: minutesBetween(accepted, delivered),
      totalMinutes: minutesBetween(created, delivered),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Speed report: which restaurants hand orders over fast, which couriers are slow.
// ---------------------------------------------------------------------------

export type SpeedVerdict = "fast" | "normal" | "slow" | "few_orders";

export interface RestaurantSpeedRow {
  name: string;
  orders: number;
  /** Courier accepted → collected the order (travel to the restaurant + waiting for the food). */
  avgPickupMinutes: number | null;
  /** Order placed → handed to the customer. */
  avgTotalMinutes: number | null;
  slowestPickupMinutes: number | null;
  verdict: SpeedVerdict;
}

export interface CourierSpeedRow {
  id: string;
  name: string;
  phone: string;
  deliveries: number;
  /** Collected the order → handed to the customer (pure riding). */
  avgRideMinutes: number | null;
  /** Accepted → collected. */
  avgPickupMinutes: number | null;
  /** Accepted → handed to the customer. */
  avgDeliveryMinutes: number | null;
  slowestDeliveryMinutes: number | null;
  verdict: SpeedVerdict;
}

export interface SpeedReport {
  days: number;
  orders: number;
  overall: {
    avgWaitMinutes: number | null;
    avgPickupMinutes: number | null;
    avgRideMinutes: number | null;
    avgDeliveryMinutes: number | null;
    avgTotalMinutes: number | null;
  };
  restaurants: RestaurantSpeedRow[];
  couriers: CourierSpeedRow[];
}

/** Fewer delivered orders than this and one odd delivery decides the average: no verdict. */
export const SPEED_MIN_SAMPLE = 5;
// A step longer than this means someone forgot to press the button, not a slow delivery.
const MAX_STEP_MINUTES = 180;

export function speedVerdict(avg: number | null, overall: number | null, sample: number): SpeedVerdict {
  if (avg == null || overall == null || overall <= 0 || sample < SPEED_MIN_SAMPLE) return "few_orders";
  if (avg <= overall * 0.8) return "fast";
  if (avg >= overall * 1.25) return "slow";
  return "normal";
}

const n = (v: unknown): number | null => (v == null ? null : Math.round(Number(v)));

// One row per delivered order with each step in minutes; impossible steps become NULL
// so they drop out of the averages instead of wrecking them.
const STEPS_CTE = `
  WITH h AS (
    SELECT order_id,
           MAX(created_at) FILTER (WHERE status = 'accepted')  AS accepted_at,
           MAX(created_at) FILTER (WHERE status = 'picked_up') AS picked_up_at,
           MAX(created_at) FILTER (WHERE status = 'delivered') AS delivered_at
    FROM order_status_history GROUP BY order_id),
  raw AS (
    SELECT o.id, o.courier_id, o.restaurant_name,
           EXTRACT(EPOCH FROM (h.accepted_at  - o.created_at))   / 60 AS wait_m,
           EXTRACT(EPOCH FROM (h.picked_up_at - h.accepted_at))  / 60 AS pickup_m,
           EXTRACT(EPOCH FROM (h.delivered_at - h.picked_up_at)) / 60 AS ride_m,
           EXTRACT(EPOCH FROM (h.delivered_at - h.accepted_at))  / 60 AS delivery_m,
           EXTRACT(EPOCH FROM (h.delivered_at - o.created_at))   / 60 AS total_m
    FROM orders o JOIN h ON h.order_id = o.id
    WHERE o.status = 'delivered' AND o.created_at >= NOW() - make_interval(days => $1)),
  t AS (
    SELECT id, courier_id, restaurant_name,
           CASE WHEN wait_m     BETWEEN 0 AND ${MAX_STEP_MINUTES} THEN wait_m     END AS wait_m,
           CASE WHEN pickup_m   BETWEEN 0 AND ${MAX_STEP_MINUTES} THEN pickup_m   END AS pickup_m,
           CASE WHEN ride_m     BETWEEN 0 AND ${MAX_STEP_MINUTES} THEN ride_m     END AS ride_m,
           CASE WHEN delivery_m BETWEEN 0 AND ${MAX_STEP_MINUTES} THEN delivery_m END AS delivery_m,
           CASE WHEN total_m    BETWEEN 0 AND ${MAX_STEP_MINUTES * 2} THEN total_m END AS total_m
    FROM raw)`;

export async function getSpeedReport(days: number): Promise<SpeedReport> {
  const [overall, restaurants, couriers] = await Promise.all([
    pool.query(`${STEPS_CTE}
      SELECT COUNT(*)::int AS orders, AVG(wait_m) AS wait, AVG(pickup_m) AS pickup, AVG(ride_m) AS ride,
             AVG(delivery_m) AS delivery, AVG(total_m) AS total FROM t`, [days]),
    pool.query(`${STEPS_CTE}
      SELECT restaurant_name AS name, COUNT(*)::int AS orders, COUNT(pickup_m)::int AS sample,
             AVG(pickup_m) AS pickup, AVG(total_m) AS total, MAX(pickup_m) AS slowest
      FROM t WHERE restaurant_name <> '' GROUP BY restaurant_name`, [days]),
    pool.query(`${STEPS_CTE}
      SELECT t.courier_id AS id, COALESCE(u.name, '') AS name, COALESCE(u.phone, '') AS phone,
             COUNT(*)::int AS deliveries, COUNT(t.ride_m)::int AS sample,
             AVG(t.ride_m) AS ride, AVG(t.pickup_m) AS pickup, AVG(t.delivery_m) AS delivery, MAX(t.delivery_m) AS slowest
      FROM t LEFT JOIN users u ON u.id = t.courier_id
      WHERE t.courier_id IS NOT NULL AND t.courier_id <> ''
      GROUP BY t.courier_id, u.name, u.phone`, [days]),
  ]);
  const o = overall.rows[0] ?? {};
  const overallPickup = n(o["pickup"]);
  const overallRide = n(o["ride"]);
  // Slowest first: the list is read to find what to fix.
  const bySlowest = <T>(pick: (r: T) => number | null) => (a: T, b: T) => (pick(b) ?? -1) - (pick(a) ?? -1);
  return {
    days,
    orders: Number(o["orders"] ?? 0),
    overall: {
      avgWaitMinutes: n(o["wait"]), avgPickupMinutes: overallPickup, avgRideMinutes: overallRide,
      avgDeliveryMinutes: n(o["delivery"]), avgTotalMinutes: n(o["total"]),
    },
    restaurants: restaurants.rows.map((r): RestaurantSpeedRow => ({
      name: String(r["name"]), orders: Number(r["orders"]),
      avgPickupMinutes: n(r["pickup"]), avgTotalMinutes: n(r["total"]), slowestPickupMinutes: n(r["slowest"]),
      verdict: speedVerdict(n(r["pickup"]), overallPickup, Number(r["sample"])),
    })).sort(bySlowest((r) => r.avgPickupMinutes)),
    couriers: couriers.rows.map((r): CourierSpeedRow => ({
      id: String(r["id"]), name: String(r["name"]), phone: String(r["phone"]), deliveries: Number(r["deliveries"]),
      avgRideMinutes: n(r["ride"]), avgPickupMinutes: n(r["pickup"]), avgDeliveryMinutes: n(r["delivery"]),
      slowestDeliveryMinutes: n(r["slowest"]),
      verdict: speedVerdict(n(r["ride"]), overallRide, Number(r["sample"])),
    })).sort(bySlowest((r) => r.avgRideMinutes)),
  };
}
