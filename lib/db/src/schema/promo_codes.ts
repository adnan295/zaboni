import { pgTable, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { restaurantsTable } from "./restaurants";

export const promoCodesTable = pgTable("promo_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type", { enum: ["percent", "fixed"] }).notNull().default("fixed"),
  value: real("value").notNull(),
  maxUses: integer("max_uses"),
  maxUsesPerUser: integer("max_uses_per_user").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  restaurantId: text("restaurant_id").references(() => restaurantsTable.id, { onDelete: "cascade" }),

  // --- discount engine ---
  // What the discount reduces. "delivery" = the fee (courier is compensated),
  // "food" = the items total, "order" = food + delivery.
  appliesTo: text("applies_to", { enum: ["delivery", "food", "order"] }).notNull().default("delivery"),
  // Cap on a percent discount (SYP); null = uncapped.
  maxDiscount: integer("max_discount"),
  // Minimum food total required to use the code (SYP); null = none.
  minOrderValue: integer("min_order_value"),
  // Optional start of the valid window (expiresAt is the end).
  startsAt: timestamp("starts_at", { withTimezone: true }),
  // Only usable on the customer's first delivered order.
  firstOrderOnly: boolean("first_order_only").notNull().default(false),
  // Who the promo is for. "specific" = a phone list in promo_targets;
  // "new" = customers with no delivered order; "inactive" = no order in
  // inactiveDays days.
  audience: text("audience", { enum: ["all", "specific", "new", "inactive"] }).notNull().default("all"),
  inactiveDays: integer("inactive_days"),
  // Applied automatically at checkout with no code entered (e.g. first-order
  // free delivery). titleAr is shown to the customer for such promos.
  autoApply: boolean("auto_apply").notNull().default(false),
  titleAr: text("title_ar").notNull().default(""),
});

export const promoTargetsTable = pgTable("promo_targets", {
  id: text("id").primaryKey(),
  promoId: text("promo_id").notNull().references(() => promoCodesTable.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
});

export const promoUsesTable = pgTable("promo_uses", {
  id: text("id").primaryKey(),
  promoId: text("promo_id").notNull().references(() => promoCodesTable.id),
  userId: text("user_id").notNull(),
  orderId: text("order_id").notNull(),
  discountAmount: real("discount_amount").notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodesTable);
export const selectPromoCodeSchema = createSelectSchema(promoCodesTable);
export const insertPromoUseSchema = createInsertSchema(promoUsesTable);
export const selectPromoUseSchema = createSelectSchema(promoUsesTable);

export type PromoCode = typeof promoCodesTable.$inferSelect;
export type InsertPromoCode = typeof promoCodesTable.$inferInsert;
export type PromoUse = typeof promoUsesTable.$inferSelect;
export type InsertPromoUse = typeof promoUsesTable.$inferInsert;
export type PromoTarget = typeof promoTargetsTable.$inferSelect;
export type InsertPromoTarget = typeof promoTargetsTable.$inferInsert;
