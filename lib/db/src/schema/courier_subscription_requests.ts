import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subscriptionPeriodEnum } from "./courier_subscription_plans";

export const courierSubscriptionRequestsTable = pgTable("courier_subscription_requests", {
  id: text("id").primaryKey(),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  planId: text("plan_id"),
  planName: text("plan_name").notNull(),
  planPeriod: subscriptionPeriodEnum("plan_period").notNull(),
  planPrice: integer("plan_price").notNull(),
  paidAmount: integer("paid_amount").notNull(),
  receiptUrl: text("receipt_url"),
  status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).notNull().default("pending"),
  adminNote: text("admin_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscriptionRequest = typeof courierSubscriptionRequestsTable.$inferSelect;
export type InsertCourierSubscriptionRequest = typeof courierSubscriptionRequestsTable.$inferInsert;
