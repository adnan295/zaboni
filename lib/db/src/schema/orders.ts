import { pgTable, text, real, integer, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ORDER_STATUSES = [
  "searching",
  "accepted",
  "picked_up",
  "on_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const DAMASCUS_CENTER_LAT = 33.5138;
const DAMASCUS_CENTER_LON = 36.2765;

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("guest"),
  orderText: text("order_text").notNull(),
  restaurantName: text("restaurant_name").notNull().default(""),
  restaurantPhone: text("restaurant_phone").notNull().default(""),
  status: text("status", {
    enum: ORDER_STATUSES,
  })
    .notNull()
    .default("searching"),
  courierName: text("courier_name").notNull().default(""),
  courierPhone: text("courier_phone").notNull().default(""),
  courierRating: real("courier_rating").notNull().default(0),
  courierId: text("courier_id").notNull().default(""),
  address: text("address").notNull().default(""),
  destinationLat: doublePrecision("destination_lat").default(DAMASCUS_CENTER_LAT),
  destinationLon: doublePrecision("destination_lon").default(DAMASCUS_CENTER_LON),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("cash"),
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
