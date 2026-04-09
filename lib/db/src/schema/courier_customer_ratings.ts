import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const courierCustomerRatingsTable = pgTable("courier_customer_ratings", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierCustomerRating = typeof courierCustomerRatingsTable.$inferSelect;
export type InsertCourierCustomerRating = typeof courierCustomerRatingsTable.$inferInsert;
