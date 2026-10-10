import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

// The order itself is the durable source of pending work. These rows track leases
// and retries, not proof that a phone displayed a notification.
export const orderDispatchTable = pgTable("order_dispatch", {
  orderId: text("order_id")
    .primaryKey()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseId: text("lease_id"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastAccepted: integer("last_accepted").notNull().default(0),
  lastFailed: integer("last_failed").notNull().default(0),
  lastError: text("last_error"),
});

export const pushReceiptsTable = pgTable("push_receipts", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  orderId: text("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
