import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const customerSubscriptionsTable = pgTable("customer_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  planType: text("plan_type", { enum: ["monthly"] }).notNull().default("monthly"),
  pricePaid: integer("price_paid").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdByAdmin: boolean("created_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerSubscription = typeof customerSubscriptionsTable.$inferSelect;
export type InsertCustomerSubscription = typeof customerSubscriptionsTable.$inferInsert;
