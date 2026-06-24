import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addCourierMonthlySubscriptions() {
  await db.execute(sql`
    ALTER TABLE courier_subscriptions
      ADD COLUMN IF NOT EXISTS vehicle_type TEXT NOT NULL DEFAULT 'motorcycle',
      ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS gifted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await db.execute(sql`
    UPDATE courier_subscriptions
    SET
      starts_at = (date || 'T00:00:00+00:00')::TIMESTAMPTZ,
      ends_at   = ((date::DATE + INTERVAL '30 days') || 'T00:00:00+00:00')::TIMESTAMPTZ
    WHERE starts_at IS NULL AND date IS NOT NULL
  `);

  await db.execute(sql`
    UPDATE courier_subscriptions
    SET
      starts_at = NOW(),
      ends_at   = NOW() + INTERVAL '30 days'
    WHERE starts_at IS NULL
  `);

  await db.execute(sql`
    ALTER TABLE courier_subscriptions
      ALTER COLUMN starts_at SET NOT NULL,
      ALTER COLUMN ends_at SET NOT NULL
  `);

  await db.execute(sql`
    ALTER TABLE courier_subscriptions
      ALTER COLUMN date DROP NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS courier_subscription_plans (
      vehicle_type TEXT PRIMARY KEY CHECK (vehicle_type IN ('bicycle', 'motorcycle', 'car')),
      monthly_price INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    INSERT INTO courier_subscription_plans (vehicle_type, monthly_price)
    VALUES ('bicycle', 0), ('motorcycle', 0), ('car', 0)
    ON CONFLICT (vehicle_type) DO NOTHING
  `);

  console.log("[migration] courier monthly subscriptions schema applied.");
}
