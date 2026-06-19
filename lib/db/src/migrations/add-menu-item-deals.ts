import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addMenuItemDeals() {
  await db.execute(sql`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS is_deal boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS deal_price real
  `);
  console.log("[migration] menu_items.is_deal / deal_price columns ensured.");
}
