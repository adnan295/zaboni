// "هاتف الإدارة": couriers and customers never see each other's number.
//
// Old Android phones with company SIMs sit in the office running the Zaboni
// line app (artifacts/call-line). Each one is the device's default dialer. When
// a courier or a customer calls the company number, the line answers, asks this
// server who the caller is trying to reach (their order in progress), dials that
// person and merges the two calls into a conference. Each side only ever sees the
// company number, and every call is logged here.
//
// While the switch is on and at least one line is online, the apps are handed
// the company number in place of the other side's phone, so even an old app
// version's call button goes through the line. With no line online, the real
// numbers come back, so nobody is left unable to reach the other side.

import { pool } from "@workspace/db";
import { createHash, randomBytes } from "node:crypto";

export const CALL_BRIDGE_SETTING_KEY = "call_bridge_enabled";
/** A line that has not checked in for this long is treated as off (no power, no Wi-Fi). */
export const LINE_ONLINE_WINDOW_MS = 90_000;
/** Orders still callable after delivery, for "you forgot the bread". */
const AFTER_DELIVERY_WINDOW_MIN = 20;
/** How long "I'm calling about this order" from the app wins over the newest order. */
const INTENT_WINDOW_MIN = 3;
const ACTIVE_STATUSES = ["accepted", "picked_up", "on_way"];

export interface CallLine {
  id: string;
  label: string;
  phone: string;
  enabled: boolean;
  lastSeenAt: string | null;
  online: boolean;
}

export interface RouteResult {
  callId: string;
  /** Number for the line's SIM to dial, in local form (09…). */
  dial: string;
  orderId: string;
  callerRole: "courier" | "customer";
}

export type RouteRejection = { reject: true; reason: "unknown_caller" | "no_active_order" | "no_target_phone" };

let schemaReady: Promise<void> | null = null;
export function ensureCallBridgeSchema(): Promise<void> {
  schemaReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS call_bridge_lines (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS call_bridge_calls (
      id TEXT PRIMARY KEY,
      line_id TEXT NOT NULL,
      order_id TEXT,
      caller_id TEXT,
      caller_role TEXT,
      caller_phone TEXT NOT NULL,
      target_id TEXT,
      target_phone TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      merged_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS call_bridge_calls_created_idx ON call_bridge_calls (created_at DESC);
    CREATE TABLE IF NOT EXISTS call_bridge_intents (
      user_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).then(() => undefined);
  schemaReady.catch(() => { schemaReady = null; });
  return schemaReady;
}

/** The last 9 digits of a Syrian mobile: "+963 933…", "00963933…", "0933…" all match. */
export function normalizePhone(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("963")) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d.length >= 9 ? d.slice(-9) : d;
}

/** How a Syrian SIM dials it. Non-Syrian numbers keep their international form. */
export function localDialForm(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  const syrian = /^(00)?963/.test(digits) || /^0?9\d{8}$/.test(digits);
  if (syrian) return "0" + normalizePhone(raw);
  return digits.startsWith("00") ? "+" + digits.slice(2) : "+" + digits;
}

/** Rows touched by an UPDATE/DELETE (node-postgres says rowCount, PGlite affectedRows). */
const changed = (r: unknown) => {
  const x = r as { rowCount?: number | null; affectedRows?: number };
  return (x.rowCount ?? x.affectedRows ?? 0) > 0;
};

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

// ── Line state cache ──────────────────────────────────────────────────────────
// Order payloads are built in many places, some synchronous (socket emits), so
// "which number do we show" is answered from a snapshot refreshed every few
// seconds and on every line check-in.

interface BridgeSnapshot { enabled: boolean; onlinePhones: string[] }
let snapshot: BridgeSnapshot = { enabled: false, onlinePhones: [] };

export async function refreshBridgeState(): Promise<BridgeSnapshot> {
  try {
    await ensureCallBridgeSchema();
    const [setting, lines] = await Promise.all([
      pool.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [CALL_BRIDGE_SETTING_KEY]),
      pool.query(
        `SELECT phone FROM call_bridge_lines
          WHERE enabled AND last_seen_at > NOW() - ($1 || ' milliseconds')::interval
          ORDER BY id`,
        [String(LINE_ONLINE_WINDOW_MS)],
      ),
    ]);
    snapshot = {
      enabled: String(setting.rows[0]?.value ?? "") === "true",
      onlinePhones: lines.rows.map((r: { phone: string }) => r.phone),
    };
  } catch {
    // Keep the last snapshot: a database hiccup should not flip numbers back and forth.
  }
  return snapshot;
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startBridgeStateRefresh(everyMs = 15_000): void {
  if (timer) return;
  void refreshBridgeState();
  timer = setInterval(() => { void refreshBridgeState(); }, everyMs);
  timer.unref?.();
}

/** True when phones are being hidden right now. */
export function maskingActive(): boolean {
  return snapshot.enabled && snapshot.onlinePhones.length > 0;
}

/**
 * The company number to show for this order, or null when masking is off (show
 * the real number). Spreads orders across lines so one line is not always busy.
 */
export function publicLineNumber(orderId: string): string | null {
  if (!maskingActive()) return null;
  const phones = snapshot.onlinePhones;
  let h = 0;
  for (const ch of orderId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return phones[h % phones.length] ?? null;
}

/** Replace the courier's phone on an order a customer is about to see. */
export function maskCourierPhone<T extends { id?: string; status?: string; courierPhone?: string | null }>(order: T): T & { phoneMasked?: boolean } {
  if (!order || !order.id || !order.courierPhone) return order;
  const line = publicLineNumber(order.id);
  if (!line) return order;
  // A cancelled order has no one to call; leave no number behind in the history.
  const callable = !order.status || [...ACTIVE_STATUSES, "delivered"].includes(order.status);
  return { ...order, courierPhone: callable ? line : "", phoneMasked: true };
}

// ── Lines (admin) ─────────────────────────────────────────────────────────────

export async function createLine(input: { label?: string; phone: string }): Promise<{ id: string; token: string }> {
  await ensureCallBridgeSchema();
  const phone = String(input.phone ?? "").trim();
  if (normalizePhone(phone).length !== 9) throw new Error("bad_phone");
  const id = "line_" + randomBytes(5).toString("hex");
  const token = randomBytes(18).toString("base64url");
  await pool.query(
    `INSERT INTO call_bridge_lines (id, label, phone, token_hash) VALUES ($1, $2, $3, $4)`,
    [id, String(input.label ?? "").trim(), localDialForm(phone), hashToken(token)],
  );
  return { id, token };
}

export async function listLines(): Promise<CallLine[]> {
  await ensureCallBridgeSchema();
  const { rows } = await pool.query(
    `SELECT id, label, phone, enabled, last_seen_at,
            (enabled AND last_seen_at > NOW() - ($1 || ' milliseconds')::interval) AS online
       FROM call_bridge_lines ORDER BY created_at`,
    [String(LINE_ONLINE_WINDOW_MS)],
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id), label: String(r.label ?? ""), phone: String(r.phone), enabled: Boolean(r.enabled),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at as string).toISOString() : null, online: Boolean(r.online),
  }));
}

export async function setLineEnabled(id: string, enabled: boolean): Promise<boolean> {
  await ensureCallBridgeSchema();
  const r = await pool.query(`UPDATE call_bridge_lines SET enabled = $2 WHERE id = $1`, [id, enabled]);
  void refreshBridgeState();
  return changed(r);
}

export async function deleteLine(id: string): Promise<boolean> {
  await ensureCallBridgeSchema();
  const r = await pool.query(`DELETE FROM call_bridge_lines WHERE id = $1`, [id]);
  void refreshBridgeState();
  return changed(r);
}

export async function setBridgeEnabled(enabled: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [CALL_BRIDGE_SETTING_KEY, enabled ? "true" : "false"],
  );
  await refreshBridgeState();
}

// ── Line device API ───────────────────────────────────────────────────────────

export async function lineByToken(token: string | undefined | null): Promise<{ id: string; phone: string } | null> {
  if (!token) return null;
  await ensureCallBridgeSchema();
  const { rows } = await pool.query(
    `SELECT id, phone FROM call_bridge_lines WHERE token_hash = $1 AND enabled LIMIT 1`,
    [hashToken(token)],
  );
  return rows[0] ? { id: String(rows[0].id), phone: String(rows[0].phone) } : null;
}

export async function heartbeat(lineId: string): Promise<void> {
  const wasOnline = snapshot.onlinePhones.length;
  await pool.query(`UPDATE call_bridge_lines SET last_seen_at = NOW() WHERE id = $1`, [lineId]);
  if (!wasOnline || !maskingActive()) await refreshBridgeState();
}

/** The app tells us which order a call is about, for couriers carrying more than one. */
export async function recordCallIntent(userId: string, orderId: string): Promise<void> {
  await ensureCallBridgeSchema();
  await pool.query(
    `INSERT INTO call_bridge_intents (user_id, order_id, created_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET order_id = EXCLUDED.order_id, created_at = NOW()`,
    [userId, orderId],
  );
}

/**
 * Someone called the company number. Work out whose order this is about and who
 * to connect them to: a courier reaches the customer of their order in progress,
 * a customer reaches the courier carrying their order.
 */
export async function routeIncomingCall(lineId: string, fromRaw: string): Promise<RouteResult | RouteRejection> {
  await ensureCallBridgeSchema();
  const from = normalizePhone(fromRaw);
  const callId = "call_" + randomBytes(6).toString("hex");
  const log = (status: string, extra: Record<string, unknown> = {}) => pool.query(
    `INSERT INTO call_bridge_calls (id, line_id, order_id, caller_id, caller_role, caller_phone, target_id, target_phone, status, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [callId, lineId, extra.orderId ?? null, extra.callerId ?? null, extra.callerRole ?? null, fromRaw,
      extra.targetId ?? null, extra.targetPhone ?? null, status, extra.reason ?? null],
  );

  const caller = from.length === 9
    ? (await pool.query(
        `SELECT id, role FROM users WHERE RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = $1 LIMIT 1`,
        [from],
      )).rows[0]
    : undefined;
  if (!caller) {
    await log("rejected", { reason: "unknown_caller" });
    return { reject: true, reason: "unknown_caller" };
  }
  const callerRole: "courier" | "customer" = caller.role === "courier" ? "courier" : "customer";
  const mine = callerRole === "courier" ? "o.courier_id = $1" : "o.user_id = $1 AND o.courier_id <> ''";
  const { rows: orders } = await pool.query(
    `SELECT o.id, o.user_id, o.courier_id, o.courier_phone, cu.phone AS customer_phone, co.phone AS courier_user_phone,
            (i.order_id IS NOT NULL) AS intended
       FROM orders o
       LEFT JOIN users cu ON cu.id = o.user_id
       LEFT JOIN users co ON co.id = o.courier_id
       LEFT JOIN call_bridge_intents i
              ON i.user_id = $1 AND i.order_id = o.id AND i.created_at > NOW() - INTERVAL '${INTENT_WINDOW_MIN} minutes'
      WHERE ${mine}
        AND (o.status = ANY($2::text[])
             OR (o.status = 'delivered' AND o.updated_at > NOW() - INTERVAL '${AFTER_DELIVERY_WINDOW_MIN} minutes'))
      ORDER BY intended DESC, (o.status = 'delivered') ASC, o.updated_at DESC
      LIMIT 1`,
    [caller.id, ACTIVE_STATUSES],
  );
  const o = orders[0];
  if (!o) {
    await log("rejected", { callerId: caller.id, callerRole, reason: "no_active_order" });
    return { reject: true, reason: "no_active_order" };
  }
  const targetId = callerRole === "courier" ? o.user_id : o.courier_id;
  const targetPhone = callerRole === "courier" ? o.customer_phone : (o.courier_user_phone || o.courier_phone);
  if (!targetPhone) {
    await log("rejected", { orderId: o.id, callerId: caller.id, callerRole, targetId, reason: "no_target_phone" });
    return { reject: true, reason: "no_target_phone" };
  }
  await log("dialing", { orderId: o.id, callerId: caller.id, callerRole, targetId, targetPhone });
  return { callId, dial: localDialForm(targetPhone), orderId: String(o.id), callerRole };
}

export type CallEvent = "merged" | "ended" | "failed";

/** The line reports how the call went: connected, finished, or never connected (and why). */
export async function recordCallEvent(lineId: string, callId: string, event: CallEvent, reason?: string): Promise<boolean> {
  const sql = event === "merged"
    ? `UPDATE call_bridge_calls SET status = 'merged', merged_at = NOW() WHERE id = $1 AND line_id = $2`
    : event === "ended"
      ? `UPDATE call_bridge_calls SET status = CASE WHEN merged_at IS NULL THEN 'failed' ELSE 'ended' END,
                ended_at = NOW(), reason = COALESCE(reason, $3) WHERE id = $1 AND line_id = $2`
      : `UPDATE call_bridge_calls SET status = 'failed', ended_at = NOW(), reason = $3 WHERE id = $1 AND line_id = $2`;
  const args = event === "merged" ? [callId, lineId] : [callId, lineId, reason ? String(reason).slice(0, 60) : null];
  const r = await pool.query(sql, args);
  return changed(r);
}

export interface CallLogRow {
  id: string;
  lineId: string;
  orderId: string | null;
  callerRole: string | null;
  callerName: string | null;
  targetName: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
  talkSeconds: number | null;
}

export async function listCalls(limit = 100): Promise<CallLogRow[]> {
  await ensureCallBridgeSchema();
  const { rows } = await pool.query(
    `SELECT c.*, cu.name AS caller_name, tu.name AS target_name
       FROM call_bridge_calls c
       LEFT JOIN users cu ON cu.id = c.caller_id
       LEFT JOIN users tu ON tu.id = c.target_id
      ORDER BY c.created_at DESC LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  );
  return rows.map((r: Record<string, any>) => ({
    id: r.id, lineId: r.line_id, orderId: r.order_id, callerRole: r.caller_role,
    callerName: r.caller_name ?? null, targetName: r.target_name ?? null, status: r.status, reason: r.reason,
    createdAt: new Date(r.created_at).toISOString(),
    talkSeconds: r.merged_at && r.ended_at
      ? Math.round((new Date(r.ended_at).getTime() - new Date(r.merged_at).getTime()) / 1000) : null,
  }));
}
