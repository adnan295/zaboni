import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addUserBlocked(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false`
  );
  await db.execute(
    sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price integer`
  );
  console.log("[migration] is_blocked column and total_price ensured.");
}
