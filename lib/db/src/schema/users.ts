import { pgTable, text, timestamp, varchar, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull().default(""),
  role: text("role", { enum: ["customer", "courier"] }).notNull().default("customer"),
  pushToken: varchar("push_token", { length: 512 }),
  courierLat: doublePrecision("courier_lat"),
  courierLon: doublePrecision("courier_lon"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export const selectUserSchema = createSelectSchema(usersTable);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
