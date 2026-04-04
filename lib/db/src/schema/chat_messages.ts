import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const chatMessagesTable = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderRole: text("sender_role", { enum: ["customer", "courier"] }).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable);
export const selectChatMessageSchema = createSelectSchema(chatMessagesTable);

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type InsertChatMessage = typeof chatMessagesTable.$inferInsert;
