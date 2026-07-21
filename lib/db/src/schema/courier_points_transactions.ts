import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Courier reward points. A courier earns points to compensate for delivery-fee
// discounts the customer used (loyalty points, promo codes, flash deals) so the
// courier isn't out of pocket, and redeems them for subscription days.
export const courierPointsTransactionsTable = pgTable("courier_points_transactions", {
  id: text("id").primaryKey(),
  courierId: text("courier_id").notNull(),
  type: text("type", { enum: ["earn", "redeem", "admin_adjust"] }).notNull(),
  points: integer("points").notNull(),
  orderId: text("order_id"),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCourierPointsTransactionSchema = createInsertSchema(courierPointsTransactionsTable);
export const selectCourierPointsTransactionSchema = createSelectSchema(courierPointsTransactionsTable);

export type CourierPointsTransaction = typeof courierPointsTransactionsTable.$inferSelect;
export type InsertCourierPointsTransaction = typeof courierPointsTransactionsTable.$inferInsert;
