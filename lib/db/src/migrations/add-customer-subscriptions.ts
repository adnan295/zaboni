import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addCustomerSubscriptions(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_subscriptions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      plan_type text NOT NULL DEFAULT 'monthly',
      price_paid integer NOT NULL DEFAULT 0,
      starts_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_by_admin boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_id
    ON customer_subscriptions (user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_active_ends
    ON customer_subscriptions (is_active, ends_at)
  `);
  console.log("[migration] customer_subscriptions table and indexes ensured.");
}
