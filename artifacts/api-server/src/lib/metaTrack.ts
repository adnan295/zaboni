import { pool } from "@workspace/db";
import { logger } from "./logger";
import { metaConfig, parseStoredMeta, sendMetaEvents, type MetaConfig, type StoredMeta } from "./metaEvents";

export const META_SETTING_KEY = "meta_capi";
let cache: { at: number; value: StoredMeta } | null = null;

export async function getStoredMeta(): Promise<StoredMeta> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [META_SETTING_KEY]);
  cache = { at: Date.now(), value: parseStoredMeta(rows[0]?.value) };
  return cache.value;
}

export async function saveStoredMeta(v: StoredMeta): Promise<void> {
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [META_SETTING_KEY, JSON.stringify(v)],
  );
  cache = { at: Date.now(), value: v };
}

export async function currentMetaConfig(): Promise<MetaConfig | null> {
  return metaConfig(process.env, await getStoredMeta().catch(() => ({})));
}

/** A new customer signed up. Fire and forget: never throws, never delays the reply. */
export function trackRegistration(userId: string, phone: string): void {
  void (async () => {
    const cfg = await currentMetaConfig();
    if (!cfg) return;
    await sendMetaEvents([{ name: "CompleteRegistration", eventId: `reg_${userId}`, time: new Date(), userId, phone }], cfg);
  })().catch((err) => logger.warn({ err: String(err) }, "meta registration event failed"));
}

/** An order was delivered: report it as a purchase worth items + delivery. */
export function trackDeliveredOrder(orderId: string): void {
  void (async () => {
    const cfg = await currentMetaConfig();
    if (!cfg) return;
    const { rows } = await pool.query(
      `SELECT o.id, o.user_id, o.restaurant_id, o.total_price, o.delivery_fee, u.phone
         FROM orders o LEFT JOIN users u ON u.id = o.user_id
        WHERE o.id = $1 AND o.status = 'delivered'`,
      [orderId],
    );
    const o = rows[0];
    if (!o || !o.user_id || o.user_id === "guest") return;
    await sendMetaEvents(
      [{
        name: "Purchase",
        eventId: `order_${o.id}`,
        time: new Date(),
        userId: o.user_id,
        phone: o.phone,
        valueSyp: (Number(o.total_price) || 0) + (Number(o.delivery_fee) || 0),
        contentIds: o.restaurant_id ? [String(o.restaurant_id)] : undefined,
      }],
      cfg,
    );
  })().catch((err) => logger.warn({ err: String(err), orderId }, "meta purchase event failed"));
}
