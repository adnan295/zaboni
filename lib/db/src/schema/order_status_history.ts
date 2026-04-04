import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { ordersTable } from "./orders";

export const orderStatusHistoryTable = pgTable("order_status_history", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["searching", "accepted", "on_way", "delivered"],
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistoryTable);
export const selectOrderStatusHistorySchema = createSelectSchema(orderStatusHistoryTable);

export type OrderStatusHistory = typeof orderStatusHistoryTable.$inferSelect;
export type InsertOrderStatusHistory = typeof orderStatusHistoryTable.$inferInsert;
