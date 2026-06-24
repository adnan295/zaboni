import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addRestaurantPushSubscriptions() {
  // Create the table with text PK (matches schema using randomUUID())
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS restaurant_push_subscriptions (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_restaurant_push_subs_restaurant_id
      ON restaurant_push_subscriptions (restaurant_id)
  `);

  console.log("[migration] restaurant_push_subscriptions table ensured.");
}
