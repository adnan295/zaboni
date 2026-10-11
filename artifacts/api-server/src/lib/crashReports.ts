// App crash monitoring: the mobile app posts every fatal JS error and every
// screen that fell into the error boundary; identical crashes are grouped by a
// fingerprint so the admin sees "this bug hit 14 people on 1.0.18" instead of
// raw noise, and gets a WhatsApp alert the first time a crash appears (or comes
// back after being marked fixed) and when one starts spreading.

import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { whatsappManager } from "./whatsapp";

export const CRASH_KINDS = ["fatal", "render", "error"] as const;
export type CrashKind = (typeof CRASH_KINDS)[number];

export interface CrashInput {
  kind: CrashKind;
  message: string;
  stack: string;
  platform: string;
  osVersion: string;
  device: string;
  appVersion: string;
  updateId: string;
  route: string;
  role: string;
  occurredAt: Date;
}

/** A crash spreading to this many people within SPIKE_WINDOW_MIN alerts again. */
const SPIKE_USERS = 3;
const SPIKE_WINDOW_MIN = 30;
/** Don't repeat a WhatsApp alert for the same crash more often than this. */
const REALERT_HOURS = 6;
const MAX_ALERTS_PER_HOUR = 10;
const RETENTION_DAYS = 60;
const ALERT_PHONE_KEY = "crash_alert_phone";

export async function ensureCrashSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_crashes (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    reporter TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    os_version TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    app_version TEXT NOT NULL DEFAULT '',
    update_id TEXT NOT NULL DEFAULT '',
    route TEXT NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS app_crashes_fp_idx ON app_crashes (fingerprint, created_at)");
  await pool.query("CREATE INDEX IF NOT EXISTS app_crashes_created_idx ON app_crashes (created_at)");
  await pool.query(`CREATE TABLE IF NOT EXISTS app_crash_groups (
    fingerprint TEXT PRIMARY KEY,
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    last_alert_at TIMESTAMPTZ
  )`);
}

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/** Validates the app's payload; returns null when it isn't a crash report. */
export function parseCrashInput(body: unknown): CrashInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const kind = CRASH_KINDS.includes(b.kind as CrashKind) ? (b.kind as CrashKind) : null;
  const message = clip(b.message, 500).trim();
  if (!kind || !message) return null;
  const at = typeof b.at === "number" ? new Date(b.at) : new Date();
  // Reports queued offline arrive late; clamp absurd device clocks to now.
  const occurredAt = Number.isNaN(at.getTime()) || Math.abs(Date.now() - at.getTime()) > 30 * 86_400_000 ? new Date() : at;
  return {
    kind,
    message,
    stack: clip(b.stack, 4000),
    platform: clip(b.platform, 20),
    osVersion: clip(b.osVersion, 40),
    device: clip(b.device, 80),
    appVersion: clip(b.appVersion, 40),
    updateId: clip(b.updateId, 64),
    route: clip(b.route, 120),
    role: clip(b.role, 20),
    occurredAt,
  };
}

/**
 * Same bug → same fingerprint, across users, devices and bundle builds: drop
 * the variable parts of the message (numbers, ids, quoted values, urls) and
 * use the first few stack frames' function names without bundle positions.
 */
export function crashFingerprint(kind: string, message: string, stack: string): string {
  const msg = message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/(["'`]).*?\1/g, "<str>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .trim();
  const frames = stack
    .split("\n")
    .map((l) => l.trim())
    // Hermes frames look like "at fn (address at …)", JSC ones "fn@file:line:col".
    .filter((l) => l.startsWith("at ") || l.includes("@"))
    .map((l) => l.replace(/\s*\(?(?:[a-z]+:\/\/|\/|address at)[^)]*\)?$/i, "").replace(/@.*$/, "").replace(/:\d+(:\d+)?/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return createHash("sha1").update([kind, msg, ...frames].join("|")).digest("hex").slice(0, 12);
}

export async function recordCrash(input: CrashInput, ctx: { userId: string | null; reporter: string }) {
  const fingerprint = crashFingerprint(input.kind, input.message, input.stack);
  await pool.query(
    `INSERT INTO app_crashes (id, fingerprint, kind, message, stack, user_id, reporter, role, platform,
       os_version, device, app_version, update_id, route, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [randomUUID(), fingerprint, input.kind, input.message, input.stack, ctx.userId, ctx.reporter, input.role,
      input.platform, input.osVersion, input.device, input.appVersion, input.updateId, input.route, input.occurredAt],
  );
  return fingerprint;
}

// ─── Alerts ───────────────────────────────────────────────────────────────

export type CrashAlertReason = "new" | "regression" | "spike";

/**
 * Decides whether a just-recorded crash warrants telling the admin right away.
 * Claims the alert atomically (last_alert_at) so concurrent reports of the same
 * crash produce one message.
 */
export async function claimCrashAlert(fingerprint: string): Promise<{ reason: CrashAlertReason; users: number } | null> {
  const { rows } = await pool.query<{ total: number; recent_users: number; since_resolved: number; muted: boolean | null; resolved_at: Date | null }>(
    `SELECT
       (SELECT COUNT(*)::int FROM app_crashes WHERE fingerprint = $1) AS total,
       (SELECT COUNT(DISTINCT reporter)::int FROM app_crashes
         WHERE fingerprint = $1 AND created_at > NOW() - make_interval(mins => $2)) AS recent_users,
       (SELECT COUNT(*)::int FROM app_crashes c WHERE c.fingerprint = $1
         AND c.created_at > COALESCE(g.resolved_at, 'infinity'::timestamptz)) AS since_resolved,
       g.muted, g.resolved_at
     FROM (SELECT 1) one LEFT JOIN app_crash_groups g ON g.fingerprint = $1`,
    [fingerprint, SPIKE_WINDOW_MIN],
  );
  const r = rows[0];
  if (!r || r.muted) return null;

  let reason: CrashAlertReason | null = null;
  if (r.total === 1) reason = "new";
  else if (r.resolved_at && r.since_resolved === 1) reason = "regression";
  else if (r.recent_users >= SPIKE_USERS) reason = "spike";
  if (!reason) return null;

  // new/regression always alert once; a spike waits out the re-alert window.
  const claim = await pool.query(
    `INSERT INTO app_crash_groups (fingerprint, last_alert_at) VALUES ($1, NOW())
     ON CONFLICT (fingerprint) DO UPDATE SET last_alert_at = NOW()
       WHERE app_crash_groups.last_alert_at IS NULL
          OR app_crash_groups.last_alert_at < NOW() - make_interval(hours => $2)
          OR $3::boolean
     RETURNING fingerprint`,
    [fingerprint, REALERT_HOURS, reason === "regression"],
  );
  if (!claim.rows.length) return null;
  return { reason, users: r.recent_users };
}

const sentAlerts: number[] = [];

export async function getCrashAlertPhone(): Promise<string> {
  const { rows } = await pool.query<{ value: string }>("SELECT value FROM system_settings WHERE key = $1", [ALERT_PHONE_KEY]);
  return rows[0]?.value ?? "";
}

export async function saveCrashAlertPhone(phone: string): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [ALERT_PHONE_KEY, phone],
  );
}

export function crashAlertText(reason: CrashAlertReason, input: CrashInput, users: number): string {
  const head = reason === "new" ? "🆕 عطل جديد بتطبيق زبوني"
    : reason === "regression" ? "♻️ رجع عطل كان معلّم إنو انحل"
    : `🔥 عطل عم ينتشر: صاب ${users} أشخاص بآخر ${SPIKE_WINDOW_MIN} دقيقة`;
  const where = [input.platform, input.appVersion && `v${input.appVersion}`, input.route].filter(Boolean).join(" · ");
  return `${head}\n\n${input.message.slice(0, 200)}\n${where}\n\nالتفاصيل: لوحة الإدارة ← الأعطال`;
}

export async function alertCrash(fingerprint: string, input: CrashInput): Promise<void> {
  const claimed = await claimCrashAlert(fingerprint);
  if (!claimed) return;
  logger.warn({ fingerprint, reason: claimed.reason, message: input.message }, "[crash] alert");
  const phone = (await getCrashAlertPhone()).trim();
  if (!phone) return;
  const now = Date.now();
  while (sentAlerts.length && now - sentAlerts[0]! > 3_600_000) sentAlerts.shift();
  if (sentAlerts.length >= MAX_ALERTS_PER_HOUR) return;
  sentAlerts.push(now);
  const ok = await whatsappManager.sendMessage(phone, crashAlertText(claimed.reason, input, claimed.users));
  if (!ok) logger.warn({ fingerprint }, "[crash] WhatsApp alert not sent");
}

// ─── Admin views ──────────────────────────────────────────────────────────

export async function getCrashOverview(days: number) {
  const since = `${days} days`;
  const [totals, byDay, groups] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS crashes, COUNT(DISTINCT reporter)::int AS users, COUNT(DISTINCT fingerprint)::int AS groups
       FROM app_crashes WHERE created_at > NOW() - $1::interval`, [since]),
    pool.query(
      `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Damascus'), 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS crashes, COUNT(DISTINCT reporter)::int AS users
       FROM app_crashes WHERE created_at > NOW() - $1::interval GROUP BY 1 ORDER BY 1`, [since]),
    pool.query(
      `SELECT c.fingerprint,
              (array_agg(c.kind ORDER BY c.created_at DESC))[1] AS kind,
              (array_agg(c.message ORDER BY c.created_at DESC))[1] AS message,
              (array_agg(c.stack ORDER BY c.created_at DESC))[1] AS stack,
              COUNT(*)::int AS count,
              COUNT(DISTINCT c.reporter)::int AS users,
              MAX(c.created_at) AS last_seen,
              (SELECT MIN(created_at) FROM app_crashes f WHERE f.fingerprint = c.fingerprint) AS first_seen,
              array_remove(array_agg(DISTINCT NULLIF(c.app_version, '')), NULL) AS versions,
              array_remove(array_agg(DISTINCT NULLIF(c.platform, '')), NULL) AS platforms,
              (array_agg(DISTINCT NULLIF(c.route, '')) FILTER (WHERE c.route <> ''))[1:3] AS routes,
              (array_agg(DISTINCT NULLIF(c.device, '')) FILTER (WHERE c.device <> ''))[1:3] AS devices,
              COALESCE(g.muted, FALSE) AS muted, g.resolved_at,
              COUNT(*) FILTER (WHERE g.resolved_at IS NOT NULL AND c.created_at > g.resolved_at)::int AS since_resolved
       FROM app_crashes c LEFT JOIN app_crash_groups g ON g.fingerprint = c.fingerprint
       WHERE c.created_at > NOW() - $1::interval
       GROUP BY c.fingerprint, g.muted, g.resolved_at
       ORDER BY COUNT(DISTINCT c.reporter) DESC, MAX(c.created_at) DESC
       LIMIT 100`, [since]),
  ]);
  return {
    days,
    totals: totals.rows[0] ?? { crashes: 0, users: 0, groups: 0 },
    byDay: byDay.rows,
    groups: groups.rows.map((g) => ({
      fingerprint: g.fingerprint as string,
      kind: g.kind as CrashKind,
      message: g.message as string,
      stack: g.stack as string,
      count: g.count as number,
      users: g.users as number,
      firstSeen: new Date(g.first_seen).toISOString(),
      lastSeen: new Date(g.last_seen).toISOString(),
      versions: (g.versions ?? []) as string[],
      platforms: (g.platforms ?? []) as string[],
      routes: (g.routes ?? []) as string[],
      devices: (g.devices ?? []) as string[],
      muted: g.muted as boolean,
      resolvedAt: g.resolved_at ? new Date(g.resolved_at).toISOString() : null,
      // Marked fixed but it happened again after that.
      regressed: (g.since_resolved as number) > 0,
    })),
  };
}

export async function getCrashEvents(fingerprint: string) {
  const { rows } = await pool.query(
    `SELECT c.id, c.kind, c.message, c.stack, c.user_id, c.role, c.platform, c.os_version, c.device,
            c.app_version, c.update_id, c.route, c.occurred_at, u.name AS user_name, u.phone AS user_phone
     FROM app_crashes c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.fingerprint = $1 ORDER BY c.created_at DESC LIMIT 50`,
    [fingerprint],
  );
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as CrashKind,
    message: r.message as string,
    stack: r.stack as string,
    userId: (r.user_id ?? null) as string | null,
    userName: (r.user_name ?? null) as string | null,
    userPhone: (r.user_phone ?? null) as string | null,
    role: r.role as string,
    platform: r.platform as string,
    osVersion: r.os_version as string,
    device: r.device as string,
    appVersion: r.app_version as string,
    updateId: r.update_id as string,
    route: r.route as string,
    occurredAt: new Date(r.occurred_at).toISOString(),
  }));
}

export async function setCrashGroupState(fingerprint: string, patch: { muted?: boolean; resolved?: boolean }) {
  await pool.query(
    `INSERT INTO app_crash_groups (fingerprint, muted, resolved_at)
     VALUES ($1, COALESCE($2, FALSE), CASE WHEN $3::boolean THEN NOW() ELSE NULL END)
     ON CONFLICT (fingerprint) DO UPDATE SET
       muted = COALESCE($2, app_crash_groups.muted),
       resolved_at = CASE WHEN $3::boolean IS NULL THEN app_crash_groups.resolved_at
                          WHEN $3::boolean THEN NOW() ELSE NULL END`,
    [fingerprint, patch.muted ?? null, patch.resolved ?? null],
  );
}

/** Crash groups the admin should look at now: new in the last day, spreading, or back after a fix. */
export async function getActiveCrashAlerts() {
  const { rows } = await pool.query(
    `SELECT c.fingerprint,
            (array_agg(c.message ORDER BY c.created_at DESC))[1] AS message,
            COUNT(*)::int AS count, COUNT(DISTINCT c.reporter)::int AS users,
            MAX(c.created_at) AS last_seen,
            (SELECT MIN(created_at) FROM app_crashes f WHERE f.fingerprint = c.fingerprint) AS first_seen,
            g.resolved_at
     FROM app_crashes c LEFT JOIN app_crash_groups g ON g.fingerprint = c.fingerprint
     WHERE c.created_at > NOW() - INTERVAL '24 hours' AND NOT COALESCE(g.muted, FALSE)
       AND (g.resolved_at IS NULL OR c.created_at > g.resolved_at)
     GROUP BY c.fingerprint, g.resolved_at
     ORDER BY MAX(c.created_at) DESC LIMIT 20`,
  );
  return rows.map((r) => ({
    fingerprint: r.fingerprint as string,
    message: r.message as string,
    count: r.count as number,
    users: r.users as number,
    lastSeen: new Date(r.last_seen).toISOString(),
    reason: (r.resolved_at ? "regression" : Date.now() - new Date(r.first_seen).getTime() < 86_400_000 ? "new" : "ongoing") as
      "regression" | "new" | "ongoing",
  }));
}

export function startCrashRetentionJob(): void {
  const prune = () =>
    pool.query(`DELETE FROM app_crashes WHERE created_at < NOW() - make_interval(days => $1)`, [RETENTION_DAYS])
      .catch((err) => logger.warn({ err }, "[crash] retention prune failed"));
  void prune();
  setInterval(prune, 24 * 3_600_000).unref();
}
