import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

export const DISPATCH_SCHEMA = `
CREATE TABLE IF NOT EXISTS order_dispatch (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  lease_id TEXT,
  last_attempt_at TIMESTAMPTZ,
  last_accepted INTEGER NOT NULL DEFAULT 0,
  last_failed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS order_dispatch_due_idx ON order_dispatch(next_attempt_at);
CREATE INDEX IF NOT EXISTS orders_dispatch_pending_idx ON orders(created_at) WHERE status = 'searching' AND courier_id = '';
CREATE TABLE IF NOT EXISTS push_receipts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_receipts_due_idx ON push_receipts(next_check_at);
`;

export async function ensureDispatchSchema(): Promise<void> {
  await pool.query(DISPATCH_SCHEMA);
}

type DispatchResult = { accepted: number; failed: number };
type Dispatch = (
  orderId: string,
  restaurantId: string | null,
  restaurantName: string,
  deliveryFee: number,
  broaden: boolean,
) => Promise<DispatchResult>;
let dispatch: Dispatch | undefined;
let running = false;

export function retryDelaySeconds(attempt: number, accepted: number): number {
  // Acceptance by a provider is not delivery to a person. Remind until the order
  // is taken, with a one-minute cap; use faster retries on complete failure.
  return accepted > 0
    ? 60
    : Math.min(60, 15 * 2 ** Math.min(Math.max(0, attempt - 1), 2));
}

export const RECOVER_DISPATCH_SQL = `
  INSERT INTO order_dispatch (order_id)
  SELECT id FROM orders WHERE status = 'searching' AND courier_id = ''
  ON CONFLICT (order_id) DO NOTHING`;
export const CLAIM_DISPATCH_SQL = `
  WITH due AS (
    SELECT d.order_id FROM order_dispatch d JOIN orders o ON o.id = d.order_id
    WHERE o.status = 'searching' AND o.courier_id = ''
      AND d.next_attempt_at <= NOW()
      AND ($2::text IS NULL OR d.order_id = $2)
      AND (d.lease_until IS NULL OR d.lease_until < NOW())
    ORDER BY d.next_attempt_at, d.order_id
    FOR UPDATE OF d SKIP LOCKED LIMIT 5
  )
  UPDATE order_dispatch d SET lease_until = NOW() + INTERVAL '3 minutes',
    lease_id = $1, attempts = attempts + 1, last_attempt_at = NOW()
  FROM due, orders o WHERE d.order_id = due.order_id AND o.id = d.order_id
  RETURNING d.order_id, d.attempts, o.restaurant_id, o.restaurant_name,
    o.delivery_fee, EXTRACT(EPOCH FROM (NOW() - o.updated_at)) AS age_seconds`;

export async function runDispatchCycle(orderId?: string): Promise<void> {
  if (!dispatch || (running && !orderId)) return;
  if (!orderId) running = true;
  try {
    // Recovers the commit-to-enqueue crash window and orders reopened by a courier.
    if (!orderId) await pool.query(RECOVER_DISPATCH_SQL);
    const leaseId = randomUUID();
    const claimed = await pool.query(CLAIM_DISPATCH_SQL, [
      leaseId,
      orderId ?? null,
    ]);
    const settled = await Promise.allSettled(
      claimed.rows.map(async (row) => {
        const heartbeat = setInterval(() => {
          void pool
            .query(
              "UPDATE order_dispatch SET lease_until = NOW() + INTERVAL '3 minutes' WHERE order_id = $1 AND lease_id = $2",
              [row.order_id, leaseId],
            )
            .catch((err) =>
              logger.error(
                { err, orderId: row.order_id },
                "Dispatch lease renewal failed",
              ),
            );
        }, 30_000);
        heartbeat.unref();
        try {
          let accepted = 0,
            failed = 0,
            error: string | null = null;
          try {
            const current = await pool.query(
              "SELECT id FROM orders WHERE id = $1 AND status = 'searching' AND courier_id = ''",
              [row.order_id],
            );
            if (current.rowCount) {
              const result = await dispatch!(
                row.order_id,
                row.restaurant_id,
                row.restaurant_name,
                row.delivery_fee,
                Number(row.age_seconds) >= 30 || row.attempts > 1,
              );
              accepted = result.accepted;
              failed = result.failed;
              if (accepted === 0)
                error = failed ? "push_rejected" : "no_reachable_couriers";
            }
          } catch (err) {
            error = "dispatch_error";
            logger.error(
              { err, orderId: row.order_id },
              "Courier dispatch failed; will retry",
            );
          }
          await pool.query(
            `UPDATE order_dispatch SET lease_id = NULL, lease_until = NULL,
        last_accepted = $3, last_failed = $4, last_error = $5,
        next_attempt_at = NOW() + ($6 * INTERVAL '1 second')
        WHERE order_id = $1 AND lease_id = $2`,
            [
              row.order_id,
              leaseId,
              accepted,
              failed,
              error,
              retryDelaySeconds(row.attempts, accepted),
            ],
          );
        } finally {
          clearInterval(heartbeat);
        }
      }),
    );
    for (const result of settled)
      if (result.status === "rejected") {
        logger.error(
          { err: result.reason },
          "Dispatch completion failed; lease recovery will retry",
        );
      }
  } catch (err) {
    logger.error(
      { err },
      "Dispatch worker failed; pending orders remain in database",
    );
  } finally {
    if (!orderId) running = false;
  }
}

export async function dispatchOrderNow(orderId: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO order_dispatch (order_id) VALUES ($1)
      ON CONFLICT (order_id) DO UPDATE SET next_attempt_at = NOW()`,
      [orderId],
    );
    await runDispatchCycle(orderId);
  } catch (err) {
    logger.error(
      { err, orderId },
      "Immediate dispatch unavailable; recovery scan will retry",
    );
  }
}

export function startOrderDispatchJob(send: Dispatch): void {
  dispatch = send;
  void runDispatchCycle();
  setInterval(() => void runDispatchCycle(), 5_000).unref();
}
