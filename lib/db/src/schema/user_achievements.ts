import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const userAchievementsTable = pgTable("user_achievements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  achievementKey: text("achievement_key").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserAchievementSchema = createInsertSchema(userAchievementsTable);
export const selectUserAchievementSchema = createSelectSchema(userAchievementsTable);

export type UserAchievement = typeof userAchievementsTable.$inferSelect;
export type InsertUserAchievement = typeof userAchievementsTable.$inferInsert;
