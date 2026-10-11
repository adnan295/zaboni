// Keeps customers from being lost while an order waits for a courier:
//  - after N minutes of searching, reassure the customer ("couriers are busy, hang on");
//  - surface those stuck orders to the admin dashboard (polled, see /admin/orders/stuck);
//  - if the customer gives up and cancels after waiting N+ minutes, send a one-off
//    free-delivery apology promo for their next order (auto-applied, 7 days).
// All three share one admin-tunable threshold (system_settings.search_alert_minutes).

import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { sendPushToUsers } from "./push";
import { whatsappManager } from "./whatsapp";

export interface WaitSettings {
  searchAlertMinutes: number;
  nudgeEnabled: boolean;
  apologyEnabled: boolean;
}

const DEFAULTS: WaitSettings = { searchAlertMinutes: 3, nudgeEnabled: true, apologyEnabled: true };
const KEYS = {
  searchAlertMinutes: "search_alert_minutes",
  nudgeEnabled: "customer_wait_nudge_enabled",
  apologyEnabled: "apology_promo_enabled",
} as const;

export const APOLOGY_CODE_PREFIX = "SORRY-";
const APOLOGY_VALID_DAYS = 7;
/** At most one apology per customer per this many days, so cancelling can't be farmed for free delivery. */
const APOLOGY_COOLDOWN_DAYS = 30;

export async function getWaitSettings(): Promise<WaitSettings> {
  const { rows } = await pool.query<{ key: string; value: string }>(
    "SELECT key, value FROM system_settings WHERE key = ANY($1)",
    [Object.values(KEYS)],
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const minutes = parseInt(map.get(KEYS.searchAlertMinutes) ?? "");
  return {
    searchAlertMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 60 ? minutes : DEFAULTS.searchAlertMinutes,
    nudgeEnabled: (map.get(KEYS.nudgeEnabled) ?? String(DEFAULTS.nudgeEnabled)) !== "false",
    apologyEnabled: (map.get(KEYS.apologyEnabled) ?? String(DEFAULTS.apologyEnabled)) !== "false",
  };
}

export async function saveWaitSettings(s: WaitSettings): Promise<void> {
  const entries: [string, string][] = [
    [KEYS.searchAlertMinutes, String(s.searchAlertMinutes)],
    [KEYS.nudgeEnabled, String(s.nudgeEnabled)],
    [KEYS.apologyEnabled, String(s.apologyEnabled)],
  ];
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value],
    );
  }
}

// ─── Stuck orders (admin alert) ───────────────────────────────────────────

export interface StuckOrder {
  id: string;
  createdAt: string;
  waitMinutes: number;
  orderType: string;
  summary: string;
  customerName: string;
  customerPhone: string;
  attempts: number;
  maxEligible: number | null;
  maxAccepted: number;
  lastError: string | null;
  nudged: boolean;
}

export async function getStuckOrders(minutes: number) {
  const { rows } = await pool.query(
    `SELECT o.id, o.created_at, o.order_type, o.restaurant_name, o.place_name, o.order_text,
            u.name, u.phone, d.attempts, d.max_eligible, d.max_accepted, d.last_error,
            d.customer_nudged_at
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN order_dispatch d ON d.order_id = o.id
     WHERE o.status = 'searching' AND o.courier_id = ''
       AND o.created_at < NOW() - ($1 * INTERVAL '1 minute')
     ORDER BY o.created_at`,
    [minutes],
  );
  const now = Date.now();
  const orders: StuckOrder[] = rows.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    waitMinutes: Math.floor((now - new Date(r.created_at).getTime()) / 60000),
    orderType: r.order_type,
    summary: String((r.order_type === "errand" ? r.place_name || r.order_text : r.restaurant_name || r.order_text) ?? "").slice(0, 60),
    customerName: (r.name ?? "").trim() || "—",
    customerPhone: r.phone ?? "",
    attempts: Number(r.attempts ?? 0),
    maxEligible: r.max_eligible == null ? null : Number(r.max_eligible),
    maxAccepted: Number(r.max_accepted ?? 0),
    lastError: r.last_error ?? null,
    nudged: r.customer_nudged_at != null,
  }));

  // Courier capacity right now — mirrors canReceiveNewOrder (free = no order
  // awaiting pickup and fewer than 2 in progress).
  const { rows: cap } = await pool.query(
    `SELECT u.id,
            COUNT(o.id) FILTER (WHERE o.status NOT IN ('delivered','cancelled','searching')) AS active,
            COUNT(o.id) FILTER (WHERE o.status = 'accepted') AS awaiting_pickup
     FROM users u
     LEFT JOIN orders o ON o.courier_id = u.id
     WHERE u.role = 'courier' AND u.is_online = true AND u.is_blocked = false
     GROUP BY u.id`,
  );
  const online = cap.length;
  const free = cap.filter((c) => Number(c.active) < 2 && Number(c.awaiting_pickup) === 0).length;
  return { minutes, orders, couriers: { online, free } };
}

// ─── Customer reassurance while searching ─────────────────────────────────

let nudgeRunning = false;

export async function runCustomerNudges(): Promise<void> {
  if (nudgeRunning) return;
  nudgeRunning = true;
  try {
    const settings = await getWaitSettings();
    if (!settings.nudgeEnabled) return;
    // Claim atomically so two server instances never message the same customer twice.
    const { rows } = await pool.query<{ order_id: string; user_id: string }>(
      `UPDATE order_dispatch d SET customer_nudged_at = NOW()
       FROM orders o
       WHERE o.id = d.order_id AND o.status = 'searching' AND o.courier_id = ''
         AND d.customer_nudged_at IS NULL
         AND o.created_at < NOW() - ($1 * INTERVAL '1 minute')
         AND o.created_at > NOW() - INTERVAL '2 hours'
       RETURNING d.order_id, o.user_id`,
      [settings.searchAlertMinutes],
    );
    for (const r of rows) {
      if (!r.user_id || r.user_id === "guest") continue;
      await sendPushToUsers(
        [r.user_id],
        "زبوني 🛵",
        "المناديب مشغولين شوي هلق 🙏 طلبك عم يوصل لكل المناديب القريبين، وأول ما حدا يقبله بيوصلك إشعار. خليك معنا!",
        { type: "order_update", orderId: r.order_id },
      ).catch((err) => logger.warn({ err, orderId: r.order_id }, "[searchWatch] nudge push failed"));
      logger.info({ orderId: r.order_id }, "[searchWatch] Sent waiting reassurance to customer");
    }
  } catch (err) {
    logger.error({ err }, "[searchWatch] nudge cycle failed");
  } finally {
    nudgeRunning = false;
  }
}

export function startSearchWatchJob(): void {
  void runCustomerNudges();
  setInterval(() => void runCustomerNudges(), 30_000).unref();
}

// ─── Apology promo after giving up ────────────────────────────────────────

export type ApologyOutcome =
  | "issued"
  | "disabled"
  | "short_wait"
  | "courier_found"
  | "suspect_account"
  | "cooldown"
  | "no_user";

/**
 * Called after a customer cancels an order that was still searching. Issues a
 * personal, single-use, auto-applied free-delivery promo when they had waited
 * at least the alert threshold. Never throws.
 */
export async function maybeIssueApologyPromo(
  userId: string,
  orderId: string,
  orderCreatedAt: Date,
): Promise<ApologyOutcome> {
  try {
    const settings = await getWaitSettings();
    if (!settings.apologyEnabled) return "disabled";

    const waited = (Date.now() - orderCreatedAt.getTime()) / 60000;
    if (waited < settings.searchAlertMinutes) return "short_wait";

    const accepted = await pool.query(
      "SELECT 1 FROM order_status_history WHERE order_id = $1 AND status = 'accepted' LIMIT 1",
      [orderId],
    );
    if (accepted.rows.length > 0) return "courier_found";

    const { rows: users } = await pool.query<{ phone: string; name: string; delivered: string; cancelled: string }>(
      `SELECT u.phone, u.name,
              COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS delivered,
              COUNT(o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.id = $1 AND u.is_blocked = false
       GROUP BY u.id`,
      [userId],
    );
    const user = users[0];
    if (!user?.phone) return "no_user";
    // Same signal the fake-account audit weights highest: never served, keeps cancelling.
    if (Number(user.delivered) === 0 && Number(user.cancelled) >= 3) return "suspect_account";

    const recent = await pool.query(
      `SELECT 1 FROM promo_codes p JOIN promo_targets t ON t.promo_id = p.id
       WHERE p.code LIKE $1 AND t.phone = $2
         AND p.created_at > NOW() - ($3 * INTERVAL '1 day')
       LIMIT 1`,
      [`${APOLOGY_CODE_PREFIX}%`, user.phone, APOLOGY_COOLDOWN_DAYS],
    );
    if (recent.rows.length > 0) return "cooldown";

    const promoId = randomUUID();
    const code = APOLOGY_CODE_PREFIX + randomBytes(4).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + APOLOGY_VALID_DAYS * 86_400_000);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO promo_codes (id, code, type, value, max_uses, max_uses_per_user, expires_at,
           is_active, applies_to, audience, auto_apply, title_ar)
         VALUES ($1, $2, 'percent', 100, 1, 1, $3, true, 'delivery', 'specific', true, $4)`,
        [promoId, code, expiresAt, "توصيل مجاني — اعتذار عن التأخير"],
      );
      await client.query("INSERT INTO promo_targets (id, promo_id, phone) VALUES ($1, $2, $3)", [
        randomUUID(),
        promoId,
        user.phone,
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const firstName = (user.name ?? "").trim().split(/\s+/)[0];
    const text =
      `${firstName ? `أهلين ${firstName}، ` : ""}منعتذر منك إنّو طلبك ما لاقى مندوب بالوقت 🙏\n` +
      `طلبك الجاي **توصيله علينا** — الخصم بيتطبّق لحاله، ما بتحتاج تكتب كود.\n` +
      `صالح ${APOLOGY_VALID_DAYS} أيام. — زبوني`;
    const sentWa = await whatsappManager.sendMessage(user.phone, text.replace(/\*\*/g, "*")).catch(() => false);
    await sendPushToUsers(
      [userId],
      "منعتذر منك 🙏",
      `طلبك الجاي توصيله مجاني — بيتطبّق تلقائياً خلال ${APOLOGY_VALID_DAYS} أيام.`,
      { type: "promo" },
    ).catch((err) => logger.warn({ err, userId }, "[apology] push failed"));
    logger.info({ userId, orderId, code, whatsapp: sentWa }, "[apology] Issued free-delivery apology promo");
    return "issued";
  } catch (err) {
    logger.error({ err, userId, orderId }, "[apology] Failed to issue apology promo");
    return "no_user";
  }
}

export async function getApologyStats(days: number) {
  const { rows } = await pool.query<{ issued: string; used: string }>(
    `SELECT COUNT(DISTINCT p.id) AS issued, COUNT(DISTINCT u.id) AS used
     FROM promo_codes p LEFT JOIN promo_uses u ON u.promo_id = p.id
     WHERE p.code LIKE $1 AND p.created_at > NOW() - ($2 * INTERVAL '1 day')`,
    [`${APOLOGY_CODE_PREFIX}%`, days],
  );
  return { issued: Number(rows[0]?.issued ?? 0), used: Number(rows[0]?.used ?? 0) };
}
