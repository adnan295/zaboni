import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addAdminNotes() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_notes (
      id TEXT PRIMARY KEY,
      courier_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      admin_id TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[migration] admin_notes table ensured.");
}
