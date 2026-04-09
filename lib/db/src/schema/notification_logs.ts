import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const notificationLogsTable = pgTable("notification_logs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  target: text("target", { enum: ["all", "customers", "couriers"] }).notNull().default("all"),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
export type InsertNotificationLog = typeof notificationLogsTable.$inferInsert;
