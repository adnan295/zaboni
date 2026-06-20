import { pgTable, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const achievementsTable = pgTable("achievements", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  icon: text("icon").notNull(),
  condition: jsonb("condition").notNull(),
});

export const insertAchievementSchema = createInsertSchema(achievementsTable);
export const selectAchievementSchema = createSelectSchema(achievementsTable);

export type Achievement = typeof achievementsTable.$inferSelect;
export type InsertAchievement = typeof achievementsTable.$inferInsert;
