import { pgTable, text, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const addressesTable = pgTable("addresses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("guest"),
  label: text("label").notNull(),
  address: text("address").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  latitude: real("latitude"),
  longitude: real("longitude"),
});

export const insertAddressSchema = createInsertSchema(addressesTable);
export const selectAddressSchema = createSelectSchema(addressesTable);

export type Address = typeof addressesTable.$inferSelect;
export type InsertAddress = typeof addressesTable.$inferInsert;
