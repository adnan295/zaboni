import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addErrandOrders() {
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'restaurant'
  `);
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS place_name TEXT
  `);
  console.log("[migration] errand orders columns ensured.");
}
