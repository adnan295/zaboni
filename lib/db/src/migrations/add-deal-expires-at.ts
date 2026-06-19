import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addDealExpiresAt() {
  await db.execute(sql`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS deal_expires_at timestamptz
  `);
  console.log("[migration] menu_items.deal_expires_at column ensured.");
}
