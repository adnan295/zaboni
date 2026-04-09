import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const deliveryZonesTable = pgTable("delivery_zones", {
  id: text("id").primaryKey(),
  label: text("label"),
  fromKm: real("from_km").notNull(),
  toKm: real("to_km").notNull(),
  fee: integer("fee").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeliveryZoneSchema = createInsertSchema(deliveryZonesTable);
export const selectDeliveryZoneSchema = createSelectSchema(deliveryZonesTable);

export type DeliveryZone = typeof deliveryZonesTable.$inferSelect;
export type InsertDeliveryZone = typeof deliveryZonesTable.$inferInsert;
