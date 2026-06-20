import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const referralCodesTable = pgTable("referral_codes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReferralCodeSchema = createInsertSchema(referralCodesTable);
export const selectReferralCodeSchema = createSelectSchema(referralCodesTable);

export type ReferralCode = typeof referralCodesTable.$inferSelect;
export type InsertReferralCode = typeof referralCodesTable.$inferInsert;
