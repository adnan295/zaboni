import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("guest"),
  orderText: text("order_text").notNull(),
  restaurantName: text("restaurant_name").notNull().default(""),
  status: text("status", {
    enum: ["searching", "accepted", "on_way", "delivered"],
  })
    .notNull()
    .default("searching"),
  courierName: text("courier_name").notNull().default(""),
  courierPhone: text("courier_phone").notNull().default(""),
  courierRating: real("courier_rating").notNull().default(0),
  courierId: text("courier_id").notNull().default(""),
  address: text("address").notNull().default(""),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectOrderSchema = createSelectSchema(ordersTable);

export type Order = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
