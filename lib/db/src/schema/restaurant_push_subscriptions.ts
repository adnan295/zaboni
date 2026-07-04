import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const restaurantPushSubscriptionsTable = pgTable("restaurant_push_subscriptions", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RestaurantPushSubscription = typeof restaurantPushSubscriptionsTable.$inferSelect;
