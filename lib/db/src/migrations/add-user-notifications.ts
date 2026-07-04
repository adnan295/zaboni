import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addUserNotifications(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      order_id TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx ON user_notifications(user_id, created_at DESC)
  `);
  console.log("[migration] user_notifications table ensured.");
}
