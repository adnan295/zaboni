import { pool } from "@workspace/db";
import { logger } from "./logger";
import { metaConfig, sendMetaEvents } from "./metaEvents";

/** A new customer signed up. Fire and forget: never throws, never delays the reply. */
export function trackRegistration(userId: string, phone: string): void {
  const cfg = metaConfig();
  if (!cfg) return;
  void sendMetaEvents([{ name: "CompleteRegistration", eventId: `reg_${userId}`, time: new Date(), userId, phone }], cfg)
    .catch((err) => logger.warn({ err: String(err) }, "meta registration event failed"));
}

/** An order was delivered: report it as a purchase worth items + delivery. */
export function trackDeliveredOrder(orderId: string): void {
  const cfg = metaConfig();
  if (!cfg) return;
  void (async () => {
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
