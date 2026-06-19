import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addPromoRestaurant() {
  await db.execute(sql`
    ALTER TABLE promo_codes
      ADD COLUMN IF NOT EXISTS restaurant_id text REFERENCES restaurants(id) ON DELETE CASCADE
  `);
  console.log("[migration] promo_codes.restaurant_id column ensured.");
}
