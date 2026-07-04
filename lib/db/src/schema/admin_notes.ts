import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminNotesTable = pgTable("admin_notes", {
  id: text("id").primaryKey(),
  courierId: text("courier_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  adminId: text("admin_id").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminNote = typeof adminNotesTable.$inferSelect;
export type InsertAdminNote = typeof adminNotesTable.$inferInsert;
