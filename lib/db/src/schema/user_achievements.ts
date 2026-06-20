import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const userAchievementsTable = pgTable("user_achievements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  achievementKey: text("achievement_key").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("user_achievements_user_key_unique").on(t.userId, t.achievementKey),
]);

export const insertUserAchievementSchema = createInsertSchema(userAchievementsTable);
export const selectUserAchievementSchema = createSelectSchema(userAchievementsTable);

export type UserAchievement = typeof userAchievementsTable.$inferSelect;
export type InsertUserAchievement = typeof userAchievementsTable.$inferInsert;
