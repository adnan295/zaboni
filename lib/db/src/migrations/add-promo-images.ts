import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addPromoImages() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS promo_images (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL,
      restaurant_name text NOT NULL,
      food_image_url text,
      old_price text NOT NULL,
      new_price text NOT NULL,
      tagline text,
      result_url text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[migration] promo_images table ensured.");
}
