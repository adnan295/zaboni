import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addFlashDeals() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_deals (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      title text NOT NULL,
      discount_type text NOT NULL DEFAULT 'percent',
      discount_value real NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      max_uses integer,
      used_count integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS flash_deal_id text REFERENCES flash_deals(id) ON DELETE SET NULL
  `);
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS flash_deal_discount integer
  `);
  console.log("[migration] flash_deals table and orders.flash_deal columns ensured.");
}
