import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const customerWalletTransactionsTable = pgTable("customer_wallet_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  type: text("type", { enum: ["referral_commission", "order_payment", "admin_adjustment"] }).notNull(),
  description: text("description").notNull().default(""),
  referralId: text("referral_id"),
  orderId: text("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerWalletTransactionSchema = createInsertSchema(customerWalletTransactionsTable);
export const selectCustomerWalletTransactionSchema = createSelectSchema(customerWalletTransactionsTable);

export type CustomerWalletTransaction = typeof customerWalletTransactionsTable.$inferSelect;
export type InsertCustomerWalletTransaction = typeof customerWalletTransactionsTable.$inferInsert;
