import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addUserAchievements() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_achievements_user_key_unique UNIQUE (user_id, achievement_key)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_achievements_user_id_idx ON user_achievements(user_id)
  `);
  console.log("[migration] user_achievements table ensured.");
}
