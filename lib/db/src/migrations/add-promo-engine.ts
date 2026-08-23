import { db } from "../index";
import { sql } from "drizzle-orm";

/**
 * Upgrades the promo/discount system into a full engine:
 *  - applies_to      : what the discount reduces (delivery | food | order)
 *  - max_discount    : cap for percent discounts (SYP)
 *  - min_order_value : minimum food total required to qualify (SYP)
 *  - starts_at       : optional start of the valid window (expires_at is the end)
 *  - first_order_only: only usable on the customer's first delivered order
 *  - audience        : all | specific (phone list) | new | inactive
 *  - inactive_days   : days of inactivity for the "inactive" audience
 *  - auto_apply      : applied automatically at checkout with no code entered
 *  - title_ar        : display title for auto-applied promos
 * plus a promo_targets table holding the phone numbers a "specific" promo is for.
 */
export async function addPromoEngine() {
  await db.execute(sql`
    ALTER TABLE promo_codes
      ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'delivery',
      ADD COLUMN IF NOT EXISTS max_discount integer,
      ADD COLUMN IF NOT EXISTS min_order_value integer,
      ADD COLUMN IF NOT EXISTS starts_at timestamptz,
      ADD COLUMN IF NOT EXISTS first_order_only boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS inactive_days integer,
      ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS title_ar text NOT NULL DEFAULT ''
  `);

  // Preserve existing behaviour: restaurant-scoped codes discount the food,
  // platform codes discount the delivery fee.
  await db.execute(sql`
    UPDATE promo_codes SET applies_to = 'food'
    WHERE restaurant_id IS NOT NULL AND applies_to = 'delivery'
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS promo_targets (
      id text PRIMARY KEY,
      promo_id text NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
      phone text NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS promo_targets_promo_id_idx ON promo_targets(promo_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS promo_targets_phone_idx ON promo_targets(phone)`);

  console.log("[migration] promo engine columns + promo_targets ensured.");
}
