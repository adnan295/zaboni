import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addCourierPoints(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS courier_points integer NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_fee_discount integer NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS courier_points_transactions (
      id text PRIMARY KEY,
      courier_id text NOT NULL,
      type text NOT NULL,
      points integer NOT NULL,
      order_id text,
      description text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  console.log("[migration] courier points (users.courier_points, orders.courier_fee_discount, courier_points_transactions) ensured.");
}
