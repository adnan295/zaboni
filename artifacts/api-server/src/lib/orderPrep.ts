// Order stages the way the big delivery apps show them:
//
//   استلمنا طلبك  →  عم يتحضّر  →  بالطريق  →  وصل
//
// • The first minute the order is "received" and the customer may still cancel.
// • It becomes "preparing" as soon as a courier takes it, or after one minute
//   without one. From then on it cannot be cancelled by the customer, and the
//   admin is alerted to order it from the restaurant and find a courier.
// • The courier stays hidden from the customer (no name, number, rating or dot on
//   the map) until they collect the order. Only then does "on the way" show them.
//   The app does the hiding from `stage`; the server keeps sending the courier's
//   details, so apps from before these stages keep working exactly as they did.
//
// When the admin presses «طلبناه من المطعم», couriers see that the restaurant
// already has it and the app stops them calling the restaurant, so the order is
// never placed twice. If a courier took it first, that button is refused.

import { pool } from "@workspace/db";

export const AUTO_PREP_AFTER_MS = 60_000;
/**
 * With «عم يتحضّر» switched off (or outside the admin's hours) nobody can order
 * from the restaurant, so the customer sees «جاري إرسال طلبك للمطعم». If no
 * courier takes it (and no admin acts on it) within this time it is cancelled,
 * and the customer is told, so they never think it is coming.
 */
export const AUTO_CANCEL_AFTER_MS = 5 * 60_000;
export const SECOND_ALERT_AFTER_MS = 10 * 60_000;

export type CustomerStage = "sending" | "received" | "preparing" | "on_way" | "delivered" | "cancelled" | "scheduled";

// Whether «عم يتحضّر» runs right now, refreshed by the job every few seconds
// (lib/orderPrepJob) so building a customer's view needs no database read.
let autoPrepNow = true;
export function setAutoPrepNow(active: boolean): void { autoPrepNow = active; }
export function autoPrepNowCached(): boolean { return autoPrepNow; }

export async function ensureOrderPrepSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS prep_started_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_ordered_at TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_ordered_by TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS no_courier_alert2_at TIMESTAMPTZ;
  `);
}

/**
 * When «عم يتحضّر» after a minute runs: only while someone at the admin can order
 * from the restaurant and hand the order to a courier. Outside these hours (or
 * switched off) orders wait for a courier as before: the customer keeps seeing
 * «استلمنا طلبك» and may still cancel, until a courier takes it.
 */
export interface AutoPrepSettings {
  enabled: boolean;
  /** Homs time "HH:MM". from === to means all day. A window may cross midnight. */
  from: string;
  to: string;
}

export const AUTO_PREP_SETTING_KEY = "order_auto_prep";
export const DEFAULT_AUTO_PREP: AutoPrepSettings = { enabled: true, from: "00:00", to: "00:00" };
const HOMS_UTC_OFFSET_MIN = 3 * 60;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm: string) => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function parseAutoPrep(raw: string | null | undefined): AutoPrepSettings {
  try {
    const v = JSON.parse(raw ?? "") as Partial<AutoPrepSettings>;
    return {
      enabled: v.enabled !== false,
      from: typeof v.from === "string" && HHMM.test(v.from) ? v.from : DEFAULT_AUTO_PREP.from,
      to: typeof v.to === "string" && HHMM.test(v.to) ? v.to : DEFAULT_AUTO_PREP.to,
    };
  } catch {
    return { ...DEFAULT_AUTO_PREP };
  }
}

export function validAutoPrep(v: AutoPrepSettings): boolean {
  return typeof v.enabled === "boolean" && minutesOf(v.from) != null && minutesOf(v.to) != null;
}

/** Is the admin on duty now (Homs time)? */
export function autoPrepActive(s: AutoPrepSettings, now = new Date()): boolean {
  if (!s.enabled) return false;
  const from = minutesOf(s.from), to = minutesOf(s.to);
  if (from == null || to == null || from === to) return true;
  const homs = (now.getUTCHours() * 60 + now.getUTCMinutes() + HOMS_UTC_OFFSET_MIN) % 1440;
  return from < to ? homs >= from && homs < to : homs >= from || homs < to;
}

export async function getAutoPrep(): Promise<AutoPrepSettings> {
  const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [AUTO_PREP_SETTING_KEY]);
  return parseAutoPrep(rows[0]?.value);
}

export async function saveAutoPrep(v: AutoPrepSettings): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [AUTO_PREP_SETTING_KEY, JSON.stringify({ enabled: v.enabled, from: v.from, to: v.to })],
  );
}

type StageInput = { status: string; prepStartedAt?: Date | string | null };

/** What the customer's tracking screen says. */
export function customerStage(o: StageInput, autoPrep = autoPrepNowCached()): CustomerStage {
  switch (o.status) {
    case "searching": return o.prepStartedAt ? "preparing" : autoPrep ? "received" : "sending";
    case "accepted": return "preparing";
    case "picked_up":
    case "on_way": return "on_way";
    case "delivered": return "delivered";
    case "cancelled": return "cancelled";
    default: return o.status === "scheduled" ? "scheduled" : "received";
  }
}

/**
 * The customer may cancel only before the order is being prepared — never once
 * the admin ordered it from the restaurant. Apps from before these stages
 * (`legacyApp`) keep their old rule: while no courier has it, unless the admin
 * already ordered it.
 */
export function customerMayCancel(o: StageInput & { adminOrderedAt?: Date | string | null }, legacyApp = false): boolean {
  if (o.adminOrderedAt) return false;
  if (legacyApp) return o.status === "searching";
  const stage = customerStage(o);
  return stage === "received" || stage === "sending";
}

/** The order as the customer's app gets it: everything as before, plus `stage`. */
export function withStage<T extends StageInput>(o: T): T & { stage: CustomerStage } {
  return { ...o, stage: customerStage(o) };
}

export interface PrepOrder {
  id: string;
  userId: string;
  restaurantName: string;
  restaurantPhone: string;
  total: number;
  address: string;
  createdAt: Date;
}

const toPrep = (r: Record<string, unknown>): PrepOrder => ({
  id: String(r.id),
  userId: String(r.user_id),
  restaurantName: String(r.restaurant_name ?? ""),
  restaurantPhone: String(r.restaurant_phone || r.r_phone || ""),
  total: Number(r.total_price ?? 0) + Number(r.delivery_fee ?? 0),
  address: String(r.address ?? ""),
  createdAt: new Date(r.created_at as string),
});

/**
 * Orders that waited a minute with no courier become "preparing". Errands have
 * no restaurant to prepare anything, so they keep waiting as before.
 * Returns the orders that just changed, for the customer and admin alerts.
 */
export async function startDuePrep(now = new Date()): Promise<PrepOrder[]> {
  const { rows } = await pool.query(
    `UPDATE orders o SET prep_started_at = $1, updated_at = $1
     WHERE o.status = 'searching' AND o.courier_id = '' AND o.prep_started_at IS NULL
       AND COALESCE(o.order_type, 'restaurant') <> 'errand'
       AND o.created_at <= $2
     RETURNING o.id, o.user_id, o.restaurant_name, o.restaurant_phone,
               (SELECT r.phone FROM restaurants r WHERE r.id = o.restaurant_id) AS r_phone,
               o.total_price, o.delivery_fee, o.address, o.created_at`,
    [now, new Date(now.getTime() - AUTO_PREP_AFTER_MS)],
  );
  return rows.map(toPrep);
}

/** Still no courier ten minutes into preparing: the food is about to be ready. */
export async function dueSecondAlerts(now = new Date()): Promise<PrepOrder[]> {
  const { rows } = await pool.query(
    `UPDATE orders o SET no_courier_alert2_at = $1
     WHERE o.status = 'searching' AND o.courier_id = '' AND o.no_courier_alert2_at IS NULL
       AND o.prep_started_at IS NOT NULL AND o.prep_started_at <= $2
     RETURNING o.id, o.user_id, o.restaurant_name, o.restaurant_phone,
               (SELECT r.phone FROM restaurants r WHERE r.id = o.restaurant_id) AS r_phone,
               o.total_price, o.delivery_fee, o.address, o.created_at`,
    [now, new Date(now.getTime() - SECOND_ALERT_AFTER_MS)],
  );
  return rows.map(toPrep);
}

/**
 * «عم يتحضّر» is off: orders nobody took within five minutes are cancelled.
 * Errands are left alone (they never had this step); an order the admin acted on
 * («طلبناه» or handed to a courier) is never cancelled here.
 */
export async function expireUnsent(now = new Date()): Promise<{ id: string; userId: string }[]> {
  const { rows } = await pool.query(
    `UPDATE orders SET status = 'cancelled', cancel_reason = COALESCE(cancel_reason, 'no_courier'), updated_at = $1
     WHERE status = 'searching' AND courier_id = '' AND prep_started_at IS NULL AND admin_ordered_at IS NULL
       AND COALESCE(order_type, 'restaurant') <> 'errand'
       AND created_at <= $2
     RETURNING id, user_id`,
    [now, new Date(now.getTime() - AUTO_CANCEL_AFTER_MS)],
  );
  for (const r of rows) {
    await pool.query(
      `INSERT INTO order_status_history (id, order_id, status, note) VALUES ($1, $2, 'cancelled', 'auto_expired') ON CONFLICT DO NOTHING`,
      [`${r.id}_cancelled_${now.getTime()}`, r.id],
    );
  }
  return rows.map((r) => ({ id: String(r.id), userId: String(r.user_id) }));
}

/** A courier took it: from now on the customer sees "preparing" (if not already). */
export async function markPrepOnAccept(orderId: string, now = new Date()): Promise<void> {
  await pool.query(`UPDATE orders SET prep_started_at = COALESCE(prep_started_at, $2) WHERE id = $1`, [orderId, now]);
}

export class PrepError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/**
 * «طلبناه من المطعم». Only while no courier has it: a courier who took it first
 * talks to the restaurant themselves, and ordering again would double it.
 */
export async function markOrderedByAdmin(orderId: string, by: string, now = new Date()): Promise<{ orderedAt: Date }> {
  const { rows } = await pool.query(
    `UPDATE orders SET admin_ordered_at = COALESCE(admin_ordered_at, $2), admin_ordered_by = COALESCE(admin_ordered_by, $3)
     WHERE id = $1 AND status = 'searching' AND courier_id = ''
     RETURNING admin_ordered_at`,
    [orderId, now, by],
  );
  if (rows[0]) return { orderedAt: new Date(rows[0].admin_ordered_at) };
  const { rows: cur } = await pool.query(`SELECT status, courier_name FROM orders WHERE id = $1`, [orderId]);
  if (!cur[0]) throw new PrepError(404, "order_not_found", "الطلب مو موجود");
  if (cur[0].status === "cancelled") throw new PrepError(409, "cancelled", "الطلب انلغى");
  throw new PrepError(409, "courier_took_it", `قبلو ${cur[0].courier_name || "مندوب"}، هو بيتواصل مع المطعم`);
}

/** Admin WhatsApp alert text. */
export function prepAlertText(o: PrepOrder, second: boolean): string {
  return [
    second ? "🚨 *أكل جاهز بالمطعم وما في مندوب*" : "⚠️ *طلب بلا مندوب من دقيقة*",
    `${o.restaurantName || "طلب"} · ${o.total.toLocaleString("en-US")} ل.س`,
    o.address ? `🏠 ${o.address.slice(0, 120)}` : null,
    second ? null : o.restaurantPhone ? `📞 اطلبوه من المطعم وكبسوا «طلبناه»: ${o.restaurantPhone}` : "📞 اطلبوه من المطعم وكبسوا «طلبناه»",
    "🛵 حوّلوه لمندوب من لوحة الإدارة",
    `#${o.id.slice(-6)}`,
  ].filter((l) => l !== null).join("\n");
}
