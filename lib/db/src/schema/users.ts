import { pgTable, text, timestamp, varchar, doublePrecision, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull().default(""),
  role: text("role", { enum: ["customer", "courier"] }).notNull().default("customer"),
  avatarUrl: text("avatar_url"),
  pushToken: varchar("push_token", { length: 512 }),
  fcmToken: varchar("fcm_token", { length: 512 }),
  apnToken: varchar("apn_token", { length: 256 }),
  courierLat: doublePrecision("courier_lat"),
  courierLon: doublePrecision("courier_lon"),
  courierLocationUpdatedAt: timestamp("courier_location_updated_at", { withTimezone: true }),
  isOnline: boolean("is_online").notNull().default(true),
  walletBalance: integer("wallet_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export const selectUserSchema = createSelectSchema(usersTable);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
