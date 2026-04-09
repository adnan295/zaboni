import { pgTable, text, integer, timestamp, pgEnum, date } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const subscriptionStatusEnum = pgEnum("subscription_status", ["paid", "waived", "pending"]);

export const courierSubscriptionsTable = pgTable("courier_subscriptions", {
  id: text("id").primaryKey(),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: integer("amount").notNull().default(0),
  status: subscriptionStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscription = typeof courierSubscriptionsTable.$inferSelect;
export type InsertCourierSubscription = typeof courierSubscriptionsTable.$inferInsert;
