import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { supportTicketsTable } from "./support_tickets";

export const supportMessagesTable = pgTable("support_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  ticketId: text("ticket_id").references(() => supportTicketsTable.id, {
    onDelete: "cascade",
  }),
  text: text("text").notNull(),
  senderRole: text("sender_role", { enum: ["customer", "support"] }).notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SupportMessage = typeof supportMessagesTable.$inferSelect;
export type InsertSupportMessage = typeof supportMessagesTable.$inferInsert;
