import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const orderRatingsTable = pgTable("order_ratings", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  userId: text("user_id").notNull(),
  courierId: text("courier_id").notNull().default(""),
  restaurantStars: integer("restaurant_stars").notNull(),
  courierStars: integer("courier_stars").notNull(),
  comment: text("comment").notNull().default(""),
  restaurantName: text("restaurant_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderRatingSchema = createInsertSchema(orderRatingsTable).omit({
  createdAt: true,
});
export const selectOrderRatingSchema = createSelectSchema(orderRatingsTable);

export type OrderRating = typeof orderRatingsTable.$inferSelect;
export type InsertOrderRating = typeof orderRatingsTable.$inferInsert;
