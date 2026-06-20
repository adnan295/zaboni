import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type", { enum: ["earn", "redeem"] }).notNull(),
  points: integer("points").notNull(),
  orderId: text("order_id"),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactionsTable);
export const selectLoyaltyTransactionSchema = createSelectSchema(loyaltyTransactionsTable);

export type LoyaltyTransaction = typeof loyaltyTransactionsTable.$inferSelect;
export type InsertLoyaltyTransaction = typeof loyaltyTransactionsTable.$inferInsert;
