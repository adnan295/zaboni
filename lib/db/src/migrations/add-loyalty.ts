import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addLoyalty(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0`
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      type text NOT NULL,
      points integer NOT NULL,
      order_id text,
      description text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  console.log("[migration] loyalty_points column and loyalty_transactions table ensured.");
}
