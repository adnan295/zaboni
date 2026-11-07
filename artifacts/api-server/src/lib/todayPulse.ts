// The first thing the admin sees: how is TODAY going, compared with yesterday
// and with the same weekday last week (a Friday is compared with last Friday,
// not with Thursday). All days are Damascus calendar days. One SQL round trip.

import { pool } from "@workspace/db";

export interface DayNumbers {
  orders: number;
  delivered: number;
  cancelled: number;
  /** Item totals of delivered orders (what customers paid restaurants). */
  gmv: number;
  deliveryFees: number;
  newCustomers: number;
  /** Customers who placed an order today and had ordered before. */
  returningCustomers: number;
  /** Distinct customers who ordered. */
  orderingCustomers: number;
  /** Courier subscriptions approved (paid) that day, and the money. */
  subscriptions: number;
  subscriptionRevenue: number;
  /** Distinct couriers who delivered at least one order. */
  activeCouriers: number;
}

export interface TodayPulse {
  /** Damascus date, YYYY-MM-DD. */
  date: string;
  today: DayNumbers;
  yesterday: DayNumbers;
  lastWeek: DayNumbers;
  /** Yesterday's full-day figure vs today's figure up to the same clock time, so a 10 am check is fair. */
  yesterdaySameTime: { orders: number; gmv: number };
  now: {
    searching: number;
    inProgress: number;
    couriersOnline: number;
    /** Searching for more than the alert threshold (minutes). */
    stuck: number;
    pendingSubscriptionRequests: number;
    pendingCourierApplications: number;
    openSupportTickets: number;
    /** Paid subscriptions ending within 3 days. */
    subscriptionsEndingSoon: number;
  };
  /** Orders per hour today, 0..23 Damascus time. */
  hourly: number[];
}

const DAY_SQL = (offset: string) => `
  WITH d AS (
    SELECT (tz.today ${offset})::timestamp AT TIME ZONE 'Asia/Damascus' AS start,
           (tz.today ${offset} + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Damascus' AS finish
    FROM (SELECT (NOW() AT TIME ZONE 'Asia/Damascus')::date AS today) tz),
  firsts AS (SELECT user_id, MIN(created_at) AS first_at FROM orders GROUP BY user_id),
  o AS (
    SELECT
      COUNT(o.id)::int AS orders,
      COUNT(o.id) FILTER (WHERE o.status = 'delivered')::int AS delivered,
      COUNT(o.id) FILTER (WHERE o.status = 'cancelled')::int AS cancelled,
      COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS gmv,
      COALESCE(SUM(o.delivery_fee) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS delivery_fees,
      COUNT(DISTINCT o.user_id)::int AS ordering_customers,
      COUNT(DISTINCT o.user_id) FILTER (WHERE fo.first_at >= d.start)::int AS new_customers,
      COUNT(DISTINCT o.user_id) FILTER (WHERE fo.first_at < d.start)::int AS returning_customers,
      COUNT(DISTINCT o.courier_id) FILTER (WHERE o.status = 'delivered' AND o.courier_id <> '')::int AS active_couriers
    FROM d
    LEFT JOIN orders o ON o.created_at >= d.start AND o.created_at < d.finish
    LEFT JOIN firsts fo ON fo.user_id = o.user_id),
  s AS (
    SELECT COUNT(s.id)::int AS subscriptions, COALESCE(SUM(s.amount), 0)::bigint AS subscription_revenue
    FROM d
    LEFT JOIN courier_subscriptions s ON s.status = 'paid' AND NOT s.gifted
      AND s.created_at >= d.start AND s.created_at < d.finish)
  SELECT o.*, s.* FROM o, s`;

function dayFromRow(r: Record<string, unknown>): DayNumbers {
  return {
    orders: Number(r["orders"]), delivered: Number(r["delivered"]), cancelled: Number(r["cancelled"]),
    gmv: Number(r["gmv"]), deliveryFees: Number(r["delivery_fees"]),
    newCustomers: Number(r["new_customers"]), returningCustomers: Number(r["returning_customers"]),
    orderingCustomers: Number(r["ordering_customers"]),
    subscriptions: Number(r["subscriptions"]), subscriptionRevenue: Number(r["subscription_revenue"]),
    activeCouriers: Number(r["active_couriers"]),
  };
}

export async function getTodayPulse(stuckMinutes: number): Promise<TodayPulse> {
  const [today, yesterday, lastWeek, sameTime, now, hourly] = await Promise.all([
    pool.query(DAY_SQL("")),
    pool.query(DAY_SQL("- INTERVAL '1 day'")),
    pool.query(DAY_SQL("- INTERVAL '7 days'")),
    pool.query(`
      SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0)::bigint AS gmv
      FROM orders
      WHERE created_at >= ((NOW() AT TIME ZONE 'Asia/Damascus')::date - 1)::timestamp AT TIME ZONE 'Asia/Damascus'
        AND created_at < NOW() - INTERVAL '1 day'`),
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM orders WHERE status = 'searching') AS searching,
        (SELECT COUNT(*)::int FROM orders WHERE status IN ('accepted', 'picked_up', 'on_way')) AS in_progress,
        (SELECT COUNT(*)::int FROM users WHERE role = 'courier' AND is_online AND NOT is_blocked) AS couriers_online,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'searching' AND created_at < NOW() - make_interval(mins => $1)) AS stuck,
        (SELECT COUNT(*)::int FROM courier_subscription_requests WHERE status = 'pending') AS pending_sub_requests,
        (SELECT COUNT(*)::int FROM courier_applications WHERE status = 'pending') AS pending_applications,
        (SELECT COUNT(*)::int FROM support_tickets WHERE status NOT IN ('resolved', 'closed')) AS open_tickets,
        (SELECT COUNT(*)::int FROM courier_subscriptions WHERE is_active AND status = 'paid' AND ends_at > NOW() AND ends_at < NOW() + INTERVAL '3 days') AS ending_soon`,
      [stuckMinutes]),
    pool.query(`
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Damascus')::int AS h, COUNT(*)::int AS n
      FROM orders
      WHERE created_at >= (NOW() AT TIME ZONE 'Asia/Damascus')::date::timestamp AT TIME ZONE 'Asia/Damascus'
      GROUP BY 1`),
  ]);
  const n = now.rows[0]!;
  const byHour = new Array<number>(24).fill(0);
  for (const r of hourly.rows) byHour[Number(r.h)] = Number(r.n);
  const { rows: [{ d }] } = await pool.query(`SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Damascus')::date, 'YYYY-MM-DD') AS d`);
  return {
    date: d as string,
    today: dayFromRow(today.rows[0]!),
    yesterday: dayFromRow(yesterday.rows[0]!),
    lastWeek: dayFromRow(lastWeek.rows[0]!),
    yesterdaySameTime: { orders: Number(sameTime.rows[0]!.orders), gmv: Number(sameTime.rows[0]!.gmv) },
    now: {
      searching: Number(n.searching), inProgress: Number(n.in_progress), couriersOnline: Number(n.couriers_online),
      stuck: Number(n.stuck), pendingSubscriptionRequests: Number(n.pending_sub_requests),
      pendingCourierApplications: Number(n.pending_applications), openSupportTickets: Number(n.open_tickets),
      subscriptionsEndingSoon: Number(n.ending_soon),
    },
    hourly: byHour,
  };
}
