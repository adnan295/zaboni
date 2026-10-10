import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const orderCreationRequestsTable = pgTable("order_creation_requests", {
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  key: text("request_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  response: jsonb("response").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.key] })]);
