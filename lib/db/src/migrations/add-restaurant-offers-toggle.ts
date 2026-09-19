import { db } from "../index";
import { sql } from "drizzle-orm";

/**
 * Adds restaurants.offers_enabled so an admin can show/hide a restaurant's
 * offers (deals) section without deleting the offer items. Defaults to true so
 * existing restaurants keep showing their offers.
 */
export async function addRestaurantOffersToggle() {
  await db.execute(sql`
    ALTER TABLE restaurants
      ADD COLUMN IF NOT EXISTS offers_enabled boolean NOT NULL DEFAULT true
  `);
  console.log("[migration] restaurants.offers_enabled column ensured.");
}
