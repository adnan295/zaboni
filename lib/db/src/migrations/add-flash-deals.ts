import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addFlashDeals() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flash_deals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      title varchar(200) NOT NULL,
      discount_type varchar(20) NOT NULL DEFAULT 'percent',
      discount_value numeric(10,2) NOT NULL,
      starts_at timestamp NOT NULL,
      ends_at timestamp NOT NULL,
      max_uses integer,
      used_count integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS flash_deal_id uuid REFERENCES flash_deals(id) ON DELETE SET NULL
  `);
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS flash_deal_discount numeric(10,2)
  `);
  console.log("[migration] flash_deals table and orders.flash_deal columns ensured.");
}
