import { pgTable, text, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const restaurantsTable = pgTable("restaurants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  category: text("category").notNull(),
  categoryAr: text("category_ar").notNull(),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  deliveryTime: text("delivery_time").notNull(),
  deliveryFee: real("delivery_fee").notNull().default(0),
  minOrder: real("min_order").notNull().default(0),
  image: text("image").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  isOpen: boolean("is_open").notNull().default(true),
  discount: text("discount"),
});

export const insertRestaurantSchema = createInsertSchema(restaurantsTable);
export const selectRestaurantSchema = createSelectSchema(restaurantsTable);

export type Restaurant = typeof restaurantsTable.$inferSelect;
export type InsertRestaurant = typeof restaurantsTable.$inferInsert;
