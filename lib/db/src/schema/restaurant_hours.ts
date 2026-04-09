import { pgTable, text, boolean, integer, time } from "drizzle-orm/pg-core";

export const restaurantHoursTable = pgTable("restaurant_hours", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  openTime: time("open_time").notNull().default("09:00"),
  closeTime: time("close_time").notNull().default("22:00"),
  isClosed: boolean("is_closed").notNull().default(false),
});

export type RestaurantHour = typeof restaurantHoursTable.$inferSelect;
export type InsertRestaurantHour = typeof restaurantHoursTable.$inferInsert;
