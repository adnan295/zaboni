import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addOrderItems() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_items (
      id text PRIMARY KEY,
      order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id text,
      name_ar text NOT NULL,
      unit_price integer NOT NULL,
      qty integer NOT NULL,
      line_total integer NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)
  `);
  console.log("[migration] order_items table ensured.");
}
