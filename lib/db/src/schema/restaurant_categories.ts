import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const restaurantCategoriesTable = pgTable("restaurant_categories", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull().default(""),
  iconName: text("icon_name").notNull().default("restaurant"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRestaurantCategorySchema = createInsertSchema(restaurantCategoriesTable);
export const selectRestaurantCategorySchema = createSelectSchema(restaurantCategoriesTable);

export type RestaurantCategory = typeof restaurantCategoriesTable.$inferSelect;
export type InsertRestaurantCategory = typeof restaurantCategoriesTable.$inferInsert;
