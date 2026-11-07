// Decision reports for the admin panel.
//
// The business sells couriers a subscription (weekly/monthly) that lets them
// deliver; delivery fees go to the courier. So the questions are:
//   per courier  — did the subscription pay off for them (earnings vs. what
//                  they paid), how much did they work, how many offers did
//                  they let pass?  → is the plan right, will they renew?
//   per restaurant — how much business did we send them (GMV)?  → the basis
//                  for a future commission.
// Pure SQL over existing tables plus courier_online_sessions /
// courier_order_offers (see courierActivity.ts, recorded from Nov 2026).

import { pool } from "@workspace/db";

export const REPORT_PERIODS = [7, 14, 30, 90] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export function parsePeriod(raw: unknown): ReportPeriod {
  const n = parseInt(String(raw ?? "30"));
  return (REPORT_PERIODS as readonly number[]).includes(n) ? (n as ReportPeriod) : 30;
}

export type CourierVerdict = "profitable" | "marginal" | "losing" | "inactive" | "no_subscription";

export interface CourierEconomicsRow {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  isBlocked: boolean;
  plan: { name: string; period: string; amount: number; endsAt: string; daysLeft: number } | null;
  /** Subscription money paid for subscriptions overlapping the period, pro-rated to it. */
  subscriptionCost: number;
  deliveries: number;
  earnings: number;
  /** earnings / subscriptionCost; null when nothing paid. */
  returnRatio: number | null;
  offers: number;
  accepted: number;
  /** accepted / offers (0..1); null when no offers recorded yet. */
  acceptanceRate: number | null;
  cancelledAfterAccept: number;
  onlineHours: number;
  /** Days with at least one online session. */
  activeDays: number;
  deliveriesPerOnlineHour: number | null;
  earningsPerOnlineHour: number | null;
  avgRating: number | null;
  verdict: CourierVerdict;
  /** Arabic one-liner explaining the verdict. */
  verdictReason: string;
}

/** Thresholds for the verdict: earnings vs what the courier paid. */
const PROFITABLE_RATIO = 2;   // earned at least twice the subscription
const MARGINAL_RATIO = 1;     // at least broke even

export function verdictFor(r: {
  subscriptionCost: number; earnings: number; deliveries: number; onlineHours: number; activeDays: number; days: number;
}): { verdict: CourierVerdict; reason: string } {
  if (r.subscriptionCost <= 0) {
    return r.deliveries > 0
      ? { verdict: "no_subscription", reason: "عم يوصّل بدون اشتراك مدفوع بهالفترة" }
      : { verdict: "inactive", reason: "ما عندو اشتراك ولا توصيلات" };
  }
  if (r.deliveries === 0) {
    return { verdict: "inactive", reason: r.onlineHours > 0 ? `اشترك وفتح التطبيق ${Math.round(r.onlineHours)} ساعة بس ما وصّل ولا طلب` : "دافع اشتراك وما فتح التطبيق أبداً" };
  }
  const ratio = r.earnings / r.subscriptionCost;
  if (ratio >= PROFITABLE_RATIO) return { verdict: "profitable", reason: `ربح ${ratio.toFixed(1)}× قيمة اشتراكو` };
  if (ratio >= MARGINAL_RATIO) return { verdict: "marginal", reason: `بالكاد غطّى اشتراكو (${ratio.toFixed(1)}×) — مهدَّد ما يجدّد` };
  return { verdict: "losing", reason: `ربح أقل من اشتراكو (${ratio.toFixed(1)}×) — الباقة أغلى من شغلو` };
}

export async function getCourierEconomics(days: ReportPeriod) {
  const { rows } = await pool.query(
    `WITH period AS (SELECT NOW() - make_interval(days => $1) AS since, NOW() AS until),
     deliveries AS (
       SELECT courier_id,
              COUNT(*) FILTER (WHERE status = 'delivered')::int AS deliveries,
              COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::int AS earnings,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_after_accept
       FROM orders, period
       WHERE courier_id <> '' AND created_at >= period.since
       GROUP BY courier_id),
     subs AS (
       -- pro-rate each overlapping subscription to the part inside the period
       SELECT s.courier_id,
              SUM(s.amount * EXTRACT(EPOCH FROM (LEAST(s.ends_at, p.until) - GREATEST(s.starts_at, p.since)))
                  / NULLIF(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)), 0))::int AS cost
       FROM courier_subscriptions s, period p
       WHERE s.status = 'paid' AND NOT s.gifted
         AND s.ends_at > p.since AND s.starts_at < p.until
       GROUP BY s.courier_id),
     current_plan AS (
       SELECT DISTINCT ON (courier_id) courier_id, plan_name, plan_period, amount, ends_at
       FROM courier_subscriptions
       WHERE is_active AND status IN ('paid', 'waived') AND ends_at > NOW()
       ORDER BY courier_id, ends_at DESC),
     sessions AS (
       SELECT courier_id,
              SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, last_seen_at), p.until) - GREATEST(started_at, p.since)))) / 3600 AS hours,
              COUNT(DISTINCT DATE(GREATEST(started_at, p.since) AT TIME ZONE 'Asia/Damascus'))::int AS active_days
       FROM courier_online_sessions, period p
       WHERE COALESCE(ended_at, last_seen_at) > p.since AND started_at < p.until
       GROUP BY courier_id),
     offers AS (
       SELECT o.courier_id,
              COUNT(*)::int AS offers,
              COUNT(*) FILTER (WHERE ord.courier_id = o.courier_id)::int AS accepted
       FROM courier_order_offers o
       JOIN orders ord ON ord.id = o.order_id, period p
       WHERE o.offered_at >= p.since
       GROUP BY o.courier_id),
     ratings AS (
       SELECT courier_id, ROUND(AVG(courier_stars)::numeric, 1) AS avg_rating
       FROM order_ratings, period p WHERE courier_stars > 0 AND created_at >= p.since GROUP BY courier_id)
     SELECT u.id, u.name, u.phone, u.is_online, u.is_blocked,
            cp.plan_name, cp.plan_period, cp.amount AS plan_amount, cp.ends_at AS plan_ends_at,
            COALESCE(sb.cost, 0) AS subscription_cost,
            COALESCE(d.deliveries, 0) AS deliveries, COALESCE(d.earnings, 0) AS earnings,
            COALESCE(d.cancelled_after_accept, 0) AS cancelled_after_accept,
            COALESCE(se.hours, 0) AS online_hours, COALESCE(se.active_days, 0) AS active_days,
            COALESCE(ofr.offers, 0) AS offers, COALESCE(ofr.accepted, 0) AS accepted,
            r.avg_rating
     FROM users u
     LEFT JOIN deliveries d ON d.courier_id = u.id
     LEFT JOIN subs sb ON sb.courier_id = u.id
     LEFT JOIN current_plan cp ON cp.courier_id = u.id
     LEFT JOIN sessions se ON se.courier_id = u.id
     LEFT JOIN offers ofr ON ofr.courier_id = u.id
     LEFT JOIN ratings r ON r.courier_id = u.id
     WHERE u.role = 'courier'
     ORDER BY COALESCE(d.earnings, 0) DESC, u.name`,
    [days],
  );

  const couriers: CourierEconomicsRow[] = rows.map((r) => {
    const subscriptionCost = Number(r.subscription_cost);
    const earnings = Number(r.earnings);
    const deliveries = Number(r.deliveries);
    const onlineHours = Math.round(Number(r.online_hours) * 10) / 10;
    const offers = Number(r.offers);
    const accepted = Number(r.accepted);
    const activeDays = Number(r.active_days);
    const v = verdictFor({ subscriptionCost, earnings, deliveries, onlineHours, activeDays, days });
    return {
      id: r.id, name: r.name, phone: r.phone, isOnline: r.is_online, isBlocked: r.is_blocked,
      plan: r.plan_name
        ? { name: r.plan_name, period: r.plan_period, amount: Number(r.plan_amount), endsAt: new Date(r.plan_ends_at).toISOString(),
            daysLeft: Math.max(0, Math.ceil((new Date(r.plan_ends_at).getTime() - Date.now()) / 86_400_000)) }
        : null,
      subscriptionCost, deliveries, earnings,
      returnRatio: subscriptionCost > 0 ? Math.round((earnings / subscriptionCost) * 100) / 100 : null,
      offers, accepted,
      acceptanceRate: offers > 0 ? Math.round((accepted / offers) * 100) / 100 : null,
      cancelledAfterAccept: Number(r.cancelled_after_accept),
      onlineHours, activeDays,
      deliveriesPerOnlineHour: onlineHours >= 1 ? Math.round((deliveries / onlineHours) * 10) / 10 : null,
      earningsPerOnlineHour: onlineHours >= 1 ? Math.round(earnings / onlineHours) : null,
      avgRating: r.avg_rating == null ? null : Number(r.avg_rating),
      verdict: v.verdict, verdictReason: v.reason,
    };
  });

  const active = couriers.filter((c) => c.subscriptionCost > 0 || c.deliveries > 0);
  const totals = {
    couriers: couriers.length,
    subscribed: couriers.filter((c) => c.plan).length,
    subscriptionRevenue: couriers.reduce((n, c) => n + c.subscriptionCost, 0),
    deliveries: couriers.reduce((n, c) => n + c.deliveries, 0),
    courierEarnings: couriers.reduce((n, c) => n + c.earnings, 0),
    onlineHours: Math.round(couriers.reduce((n, c) => n + c.onlineHours, 0)),
    byVerdict: Object.fromEntries((["profitable", "marginal", "losing", "inactive", "no_subscription"] as CourierVerdict[])
      .map((v) => [v, couriers.filter((c) => c.verdict === v).length])) as Record<CourierVerdict, number>,
    /** Subscriptions ending within 7 days whose courier is marginal/losing — likely churn. */
    renewalRisk: active.filter((c) => c.plan && c.plan.daysLeft <= 7 && (c.verdict === "marginal" || c.verdict === "losing")).length,
  };
  const hasActivityData = couriers.some((c) => c.onlineHours > 0 || c.offers > 0);
  return { days, totals, couriers, hasActivityData };
}

export interface RestaurantSalesRow {
  id: string;
  nameAr: string;
  image: string;
  isOpen: boolean;
  orders: number;
  delivered: number;
  cancelled: number;
  cancellationRate: number | null;
  /** Sum of item totals (what the customer paid the restaurant), delivered orders only. */
  gmv: number;
  avgTicket: number | null;
  deliveryFees: number;
  /** Distinct customers who ordered from it in the period. */
  customers: number;
  /** GMV change vs the previous period of the same length (fraction); null when previous was 0. */
  gmvChange: number | null;
  avgRating: number | null;
  /** What a commission at `commissionPct` would have yielded. */
  commissionAt: number;
}

export async function getRestaurantSales(days: ReportPeriod, commissionPct: number) {
  const { rows } = await pool.query(
    `WITH p AS (SELECT NOW() - make_interval(days => $1) AS since, NOW() - make_interval(days => $1 * 2) AS prev_since),
     cur AS (
       SELECT o.restaurant_id,
              COUNT(*)::int AS orders,
              COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
              COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled,
              COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS gmv,
              COALESCE(SUM(o.delivery_fee) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS fees,
              COUNT(DISTINCT o.user_id) FILTER (WHERE o.status = 'delivered')::int AS customers
       FROM orders o, p WHERE o.restaurant_id IS NOT NULL AND o.created_at >= p.since GROUP BY o.restaurant_id),
     prev AS (
       SELECT o.restaurant_id, COALESCE(SUM(o.total_price) FILTER (WHERE o.status = 'delivered'), 0)::bigint AS gmv
       FROM orders o, p WHERE o.restaurant_id IS NOT NULL AND o.created_at >= p.prev_since AND o.created_at < p.since
       GROUP BY o.restaurant_id),
     rt AS (SELECT restaurant_id, ROUND(AVG(restaurant_stars)::numeric, 1) AS avg_rating
            FROM order_ratings, p WHERE restaurant_stars > 0 AND created_at >= p.since GROUP BY restaurant_id)
     SELECT r.id, r.name_ar, r.image, r.is_open,
            COALESCE(c.orders, 0) AS orders, COALESCE(c.delivered, 0) AS delivered, COALESCE(c.cancelled, 0) AS cancelled,
            COALESCE(c.gmv, 0) AS gmv, COALESCE(c.fees, 0) AS fees, COALESCE(c.customers, 0) AS customers,
            COALESCE(pv.gmv, 0) AS prev_gmv, rt.avg_rating
     FROM restaurants r
     LEFT JOIN cur c ON c.restaurant_id = r.id
     LEFT JOIN prev pv ON pv.restaurant_id = r.id
     LEFT JOIN rt ON rt.restaurant_id = r.id
     ORDER BY COALESCE(c.gmv, 0) DESC, r.name_ar`,
    [days],
  );
  const restaurants: RestaurantSalesRow[] = rows.map((r) => {
    const gmv = Number(r.gmv), delivered = Number(r.delivered), orders = Number(r.orders), prev = Number(r.prev_gmv);
    return {
      id: r.id, nameAr: r.name_ar, image: r.image, isOpen: r.is_open,
      orders, delivered, cancelled: Number(r.cancelled),
      cancellationRate: orders > 0 ? Math.round((Number(r.cancelled) / orders) * 100) / 100 : null,
      gmv, avgTicket: delivered > 0 ? Math.round(gmv / delivered) : null,
      deliveryFees: Number(r.fees), customers: Number(r.customers),
      gmvChange: prev > 0 ? Math.round(((gmv - prev) / prev) * 100) / 100 : null,
      avgRating: r.avg_rating == null ? null : Number(r.avg_rating),
      commissionAt: Math.round(gmv * commissionPct / 100),
    };
  });
  const totals = {
    gmv: restaurants.reduce((n, r) => n + r.gmv, 0),
    delivered: restaurants.reduce((n, r) => n + r.delivered, 0),
    deliveryFees: restaurants.reduce((n, r) => n + r.deliveryFees, 0),
    commissionAt: restaurants.reduce((n, r) => n + r.commissionAt, 0),
    activeRestaurants: restaurants.filter((r) => r.delivered > 0).length,
  };
  return { days, commissionPct, totals, restaurants };
}
