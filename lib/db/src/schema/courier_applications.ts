import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const courierApplicationsTable = pgTable("courier_applications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  fullName: text("full_name").notNull(),
  vehicleType: text("vehicle_type", { enum: ["motorcycle", "car", "bicycle"] }).notNull(),
  vehiclePlate: text("vehicle_plate").notNull().default(""),
  idNumber: text("id_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCourierApplicationSchema = createInsertSchema(courierApplicationsTable);
export const selectCourierApplicationSchema = createSelectSchema(courierApplicationsTable);

export type CourierApplication = typeof courierApplicationsTable.$inferSelect;
export type InsertCourierApplication = typeof courierApplicationsTable.$inferInsert;
