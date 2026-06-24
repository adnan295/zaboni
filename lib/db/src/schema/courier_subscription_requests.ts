import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const courierSubscriptionRequestsTable = pgTable("courier_subscription_requests", {
  id: text("id").primaryKey(),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  vehicleType: text("vehicle_type", { enum: ["bicycle", "motorcycle", "car"] }).notNull(),
  planAmount: integer("plan_amount").notNull(),
  paidAmount: integer("paid_amount").notNull(),
  receiptUrl: text("receipt_url"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  adminNote: text("admin_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscriptionRequest = typeof courierSubscriptionRequestsTable.$inferSelect;
export type InsertCourierSubscriptionRequest = typeof courierSubscriptionRequestsTable.$inferInsert;
