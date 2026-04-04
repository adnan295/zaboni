import { pgTable, text, real, boolean } from "drizzle-orm/pg-core";
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
  isPopular: boolean("is_popular").notNull().default(false),
});

export const insertMenuItemSchema = createInsertSchema(menuItemsTable);
export const selectMenuItemSchema = createSelectSchema(menuItemsTable);

export type MenuItem = typeof menuItemsTable.$inferSelect;
export type InsertMenuItem = typeof menuItemsTable.$inferInsert;
