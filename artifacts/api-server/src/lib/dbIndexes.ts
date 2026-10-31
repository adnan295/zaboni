// Indexes for the lookups every screen makes ("my orders", a courier's active
// orders, a restaurant's menu, an order's history/chat…). The schema had none,
// so each of these scanned the whole table — fine at a few hundred orders,
// slow as the data grows. Idempotent; runs at startup.

import { pool } from "@workspace/db";
import { logger } from "./logger";

export const PERFORMANCE_INDEXES: [name: string, definition: string][] = [
  ["orders_user_created_idx", "orders (user_id, created_at DESC)"],
  ["orders_courier_status_idx", "orders (courier_id, status)"],
  ["orders_restaurant_created_idx", "orders (restaurant_id, created_at DESC)"],
  ["orders_status_created_idx", "orders (status, created_at DESC)"],
  ["order_status_history_order_idx", "order_status_history (order_id, created_at)"],
  ["menu_items_restaurant_idx", "menu_items (restaurant_id)"],
  ["menu_item_option_groups_item_idx", "menu_item_option_groups (menu_item_id)"],
  ["menu_item_options_group_idx", "menu_item_options (group_id)"],
  ["chat_messages_order_idx", "chat_messages (order_id, created_at)"],
  ["order_ratings_order_idx", "order_ratings (order_id)"],
  ["order_ratings_courier_idx", "order_ratings (courier_id)"],
  ["order_ratings_restaurant_idx", "order_ratings (restaurant_id)"],
  ["loyalty_transactions_user_idx", "loyalty_transactions (user_id, created_at DESC)"],
  ["loyalty_transactions_order_idx", "loyalty_transactions (order_id)"],
  ["courier_points_tx_courier_idx", "courier_points_transactions (courier_id, created_at DESC)"],
  ["addresses_user_idx", "addresses (user_id)"],
  ["support_tickets_user_idx", "support_tickets (user_id, created_at DESC)"],
  ["support_messages_ticket_idx", "support_messages (ticket_id, created_at)"],
  ["otp_codes_phone_idx", "otp_codes (phone, created_at DESC)"],
];

export async function ensurePerformanceIndexes(): Promise<void> {
  for (const [name, definition] of PERFORMANCE_INDEXES) {
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${definition}`);
    } catch (err) {
      // A missing table/column on an older database must not block startup.
      logger.warn({ err, index: name }, "[db] could not create index");
    }
  }
}
