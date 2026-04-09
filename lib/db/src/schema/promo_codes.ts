import { pgTable, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

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
