import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { restaurantsTable } from "./restaurants";

export const menuItemsTable = pgTable("menu_items", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  description: text("description").notNull().default(""),
  descriptionAr: text("description_ar").notNull().default(""),
  price: real("price").notNull(),
  image: text("image").notNull(),
  category: text("category").notNull(),
  categoryAr: text("category_ar").notNull(),
  subcategory: text("subcategory"),
  subcategoryAr: text("subcategory_ar"),
  isPopular: boolean("is_popular").notNull().default(false),
  isAvailable: boolean("is_available").notNull().default(true),
  isDeal: boolean("is_deal").notNull().default(false),
  dealPrice: real("deal_price"),
  dealDiscountPercent: real("deal_discount_percent"),
  dealExpiresAt: timestamp("deal_expires_at"),
});

export const insertMenuItemSchema = createInsertSchema(menuItemsTable);
export const selectMenuItemSchema = createSelectSchema(menuItemsTable);

export type MenuItem = typeof menuItemsTable.$inferSelect;
export type InsertMenuItem = typeof menuItemsTable.$inferInsert;
