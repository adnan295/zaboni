import { db } from "../index";
import { sql } from "drizzle-orm";

/**
 * Adds orders.cancel_reason: why the customer cancelled while the order was
 * still searching for a courier (too_slow, changed_mind, wrong_order,
 * found_elsewhere, other). NULL for every other cancellation and for apps that
 * predate the reason picker.
 */
export async function addOrderCancelReason() {
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS cancel_reason text
  `);
  console.log("[migration] orders.cancel_reason column ensured.");
}
