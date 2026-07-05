import { pgTable, text, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subscriptionPeriodEnum } from "./courier_subscription_plans";

export const subscriptionStatusEnum = pgEnum("subscription_status", ["paid", "waived", "pending"]);

export const courierSubscriptionsTable = pgTable("courier_subscriptions", {
  id: text("id").primaryKey(),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  planId: text("plan_id"),
  planName: text("plan_name").notNull(),
  planPeriod: subscriptionPeriodEnum("plan_period").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  amount: integer("amount").notNull().default(0),
  status: subscriptionStatusEnum("status").notNull().default("pending"),
  isActive: boolean("is_active").notNull().default(true),
  gifted: boolean("gifted").notNull().default(false),
  createdByAdmin: boolean("created_by_admin").notNull().default(false),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscription = typeof courierSubscriptionsTable.$inferSelect;
export type InsertCourierSubscription = typeof courierSubscriptionsTable.$inferInsert;
