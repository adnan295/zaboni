import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "deposit_request",
  "deposit_approved",
  "subscription_deduction",
]);

export const walletTransactionStatusEnum = pgEnum("wallet_transaction_status", [
  "pending",
  "approved",
  "rejected",
]);

export const courierWalletTransactionsTable = pgTable("courier_wallet_transactions", {
  id: text("id").primaryKey(),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  type: walletTransactionTypeEnum("type").notNull(),
  status: walletTransactionStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  approvedBy: text("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierWalletTransaction = typeof courierWalletTransactionsTable.$inferSelect;
export type InsertCourierWalletTransaction = typeof courierWalletTransactionsTable.$inferInsert;
