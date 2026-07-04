import { pgTable, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { restaurantsTable } from "./restaurants";

export const flashDealsTable = pgTable("flash_deals", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  discountType: text("discount_type", { enum: ["percent", "fixed"] }).notNull().default("percent"),
  discountValue: real("discount_value").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFlashDealSchema = createInsertSchema(flashDealsTable);
export const selectFlashDealSchema = createSelectSchema(flashDealsTable);
export type FlashDeal = typeof flashDealsTable.$inferSelect;
export type InsertFlashDeal = typeof flashDealsTable.$inferInsert;
