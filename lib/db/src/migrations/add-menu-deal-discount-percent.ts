import { db } from "../index";
import { sql } from "drizzle-orm";

export async function migrate() {
  await db.execute(sql`
    ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS deal_discount_percent REAL
  `);
  console.log("[migration] menu_items.deal_discount_percent column ensured.");
}
