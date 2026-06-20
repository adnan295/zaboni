import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addSupportMessages(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS support_messages (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text text NOT NULL,
      sender_role text NOT NULL CHECK (sender_role IN ('customer', 'support')),
      is_read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_messages_user_id
    ON support_messages (user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_support_messages_unread
    ON support_messages (user_id, is_read)
    WHERE is_read = false
  `);
  console.log("[migration] support_messages table and indexes ensured.");
}
