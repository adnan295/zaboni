import { pgTable, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const subscriptionPeriodEnum = pgEnum("subscription_period", ["weekly", "monthly", "yearly"]);

export const courierSubscriptionPlansTable = pgTable("courier_subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  period: subscriptionPeriodEnum("period").notNull(),
  price: integer("price").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscriptionPlan = typeof courierSubscriptionPlansTable.$inferSelect;
export type InsertCourierSubscriptionPlan = typeof courierSubscriptionPlansTable.$inferInsert;
