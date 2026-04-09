import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const subscriptionStatusEnum = pgEnum("subscription_status", ["paid", "waived", "pending"]);

export const courierSubscriptionsTable = pgTable("courier_subscriptions", {
  id: text("id").primaryKey(),
  courierId: text("courier_id").notNull(),
  date: text("date").notNull(),
  amount: integer("amount").notNull().default(0),
  status: subscriptionStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscription = typeof courierSubscriptionsTable.$inferSelect;
export type InsertCourierSubscription = typeof courierSubscriptionsTable.$inferInsert;
