import { pgTable, serial, boolean, integer, text, timestamp } from "drizzle-orm/pg-core";

export const waverifyHealthLogTable = pgTable("waverify_health_log", {
  id: serial("id").primaryKey(),
  ok: boolean("ok").notNull(),
  httpStatus: integer("http_status"),
  message: text("message"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WaVerifyHealthLog = typeof waverifyHealthLogTable.$inferSelect;
export type InsertWaVerifyHealthLog = typeof waverifyHealthLogTable.$inferInsert;
