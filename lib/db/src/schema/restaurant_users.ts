import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const restaurantUsersTable = pgTable("restaurant_users", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  authMode: text("auth_mode").notNull().default("password"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RestaurantUser = typeof restaurantUsersTable.$inferSelect;
export type InsertRestaurantUser = typeof restaurantUsersTable.$inferInsert;
