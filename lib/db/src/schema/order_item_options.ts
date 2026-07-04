import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { orderItemsTable } from "./order_items";

export const orderItemOptionsTable = pgTable("order_item_options", {
  id: text("id").primaryKey(),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItemsTable.id, { onDelete: "cascade" }),
  optionId: text("option_id"),
  nameAr: text("name_ar").notNull(),
  extraPrice: integer("extra_price").notNull().default(0),
});

export const insertOrderItemOptionSchema = createInsertSchema(orderItemOptionsTable);
export const selectOrderItemOptionSchema = createSelectSchema(orderItemOptionsTable);

export type OrderItemOption = typeof orderItemOptionsTable.$inferSelect;
export type InsertOrderItemOption = typeof orderItemOptionsTable.$inferInsert;
