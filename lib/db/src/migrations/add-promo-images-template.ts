import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addPromoImagesTemplate() {
  await db.execute(sql`
    ALTER TABLE promo_images ADD COLUMN IF NOT EXISTS template_id text NOT NULL DEFAULT 'classic-red'
  `);
  console.log("[migration] promo_images.template_id column ensured.");
}
