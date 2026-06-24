import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const courierSubscriptionPlansTable = pgTable("courier_subscription_plans", {
  vehicleType: text("vehicle_type", { enum: ["bicycle", "motorcycle", "car"] }).primaryKey(),
  monthlyPrice: integer("monthly_price").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CourierSubscriptionPlan = typeof courierSubscriptionPlansTable.$inferSelect;
