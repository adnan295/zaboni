// Records what the courier economics report needs but the schema never kept:
//
//  - courier_online_sessions: one row per stretch a courier was available
//    (is_online true). users.is_online is a single flag that each toggle
//    overwrites, so "hours worked" could not be computed before this.
//  - courier_order_offers: which courier was offered which order (a push /
//    socket "new_order"), so acceptance rate is per courier, not just the
//    per-order count the dispatcher kept.
//
// Both are append-only and idempotent to create; a failure here never blocks
// the request that triggered it.

import { pool } from "@workspace/db";
import { logger } from "./logger";

/** A session left open this long with no location ping is treated as abandoned. */
export const SESSION_STALE_HOURS = 14;

export async function ensureCourierActivitySchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS courier_online_sessions (
    id BIGSERIAL PRIMARY KEY,
    courier_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS courier_online_sessions_courier_idx
    ON courier_online_sessions (courier_id, started_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS courier_online_sessions_open_idx
    ON courier_online_sessions (courier_id) WHERE ended_at IS NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS courier_order_offers (
    order_id TEXT NOT NULL,
    courier_id TEXT NOT NULL,
    offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, courier_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS courier_order_offers_courier_idx
    ON courier_order_offers (courier_id, offered_at DESC)`);
  // Couriers already online when this shipped get a session from now on.
  await pool.query(`INSERT INTO courier_online_sessions (courier_id)
    SELECT id FROM users WHERE role = 'courier' AND is_online = true AND is_blocked = false
      AND NOT EXISTS (SELECT 1 FROM courier_online_sessions s WHERE s.courier_id = users.id AND s.ended_at IS NULL)`);
}

/** Called when the courier toggles availability. */
export async function recordAvailability(courierId: string, online: boolean): Promise<void> {
  try {
    if (online) {
      await pool.query(
        `INSERT INTO courier_online_sessions (courier_id)
         SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM courier_online_sessions WHERE courier_id = $1 AND ended_at IS NULL)`,
        [courierId],
      );
    } else {
      await pool.query(
        `UPDATE courier_online_sessions SET ended_at = NOW(), last_seen_at = NOW()
         WHERE courier_id = $1 AND ended_at IS NULL`,
        [courierId],
      );
    }
  } catch (err) {
    logger.warn({ err, courierId }, "[courier-activity] availability not recorded");
  }
}

/** Called on each location ping; keeps the open session "alive". */
export async function touchOnlineSession(courierId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE courier_online_sessions SET last_seen_at = NOW() WHERE courier_id = $1 AND ended_at IS NULL`,
      [courierId],
    );
  } catch {
    // best effort
  }
}

/** Called by the dispatcher with everyone it pushed a new-order alert to. */
export async function recordOffers(orderId: string, courierIds: string[]): Promise<void> {
  if (courierIds.length === 0) return;
  try {
    await pool.query(
      `INSERT INTO courier_order_offers (order_id, courier_id)
       SELECT $1, UNNEST($2::text[]) ON CONFLICT DO NOTHING`,
      [orderId, courierIds],
    );
  } catch (err) {
    logger.warn({ err, orderId }, "[courier-activity] offers not recorded");
  }
}

/**
 * Closes sessions whose courier stopped pinging long ago (phone died, app
 * killed) at their last ping, so a forgotten "online" doesn't count as a
 * 3-day shift. Runs hourly.
 */
export async function closeStaleSessions(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE courier_online_sessions SET ended_at = last_seen_at
     WHERE ended_at IS NULL AND last_seen_at < NOW() - make_interval(hours => $1)`,
    [SESSION_STALE_HOURS],
  );
  return rowCount ?? 0;
}

export function startCourierActivityJob(): void {
  const run = () => void closeStaleSessions().catch((err) => logger.warn({ err }, "[courier-activity] stale close failed"));
  setInterval(run, 3_600_000).unref();
}
