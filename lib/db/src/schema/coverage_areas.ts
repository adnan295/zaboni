import { pgTable, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// A delivery coverage area drawn on the map by the admin. `points` is an ordered
// polygon ring of [lat, lon] pairs. A customer location is "covered" when it
// falls inside at least one active area's polygon.
export const coverageAreasTable = pgTable("coverage_areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  points: jsonb("points").$type<[number, number][]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCoverageAreaSchema = createInsertSchema(coverageAreasTable);
export const selectCoverageAreaSchema = createSelectSchema(coverageAreasTable);

export type CoverageArea = typeof coverageAreasTable.$inferSelect;
export type InsertCoverageArea = typeof coverageAreasTable.$inferInsert;
