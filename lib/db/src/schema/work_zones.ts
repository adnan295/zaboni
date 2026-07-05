import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const workZonesTable = pgTable("work_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  city: text("city").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkZoneSchema = createInsertSchema(workZonesTable);
export const selectWorkZoneSchema = createSelectSchema(workZonesTable);

export type WorkZone = typeof workZonesTable.$inferSelect;
export type InsertWorkZone = typeof workZonesTable.$inferInsert;
