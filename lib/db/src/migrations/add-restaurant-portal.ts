import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addRestaurantPortal() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS restaurant_users (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL,
      phone text NOT NULL UNIQUE,
      name text,
      password_hash text,
      auth_mode text NOT NULL DEFAULT 'password',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    ALTER TABLE restaurant_users
      ADD COLUMN IF NOT EXISTS name text
  `);

  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS restaurant_id text
  `);

  await db.execute(sql`
    UPDATE orders o
    SET restaurant_id = r.id
    FROM restaurants r
    WHERE (o.restaurant_name = r.name_ar OR o.restaurant_name = r.name)
      AND o.restaurant_id IS NULL
  `);

  console.log("[migration] restaurant_users table and orders.restaurant_id column ensured.");
}
