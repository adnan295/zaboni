import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { menuItemsTable } from "./menu_items";

export const menuItemOptionGroupsTable = pgTable("menu_item_option_groups", {
  id: text("id").primaryKey(),
  menuItemId: text("menu_item_id")
    .notNull()
    .references(() => menuItemsTable.id, { onDelete: "cascade" }),
  nameAr: text("name_ar").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const menuItemOptionsTable = pgTable("menu_item_options", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => menuItemOptionGroupsTable.id, { onDelete: "cascade" }),
  nameAr: text("name_ar").notNull(),
  extraPrice: integer("extra_price").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertMenuItemOptionGroupSchema = createInsertSchema(menuItemOptionGroupsTable);
export const selectMenuItemOptionGroupSchema = createSelectSchema(menuItemOptionGroupsTable);
export const insertMenuItemOptionSchema = createInsertSchema(menuItemOptionsTable);
export const selectMenuItemOptionSchema = createSelectSchema(menuItemOptionsTable);

export type MenuItemOptionGroup = typeof menuItemOptionGroupsTable.$inferSelect;
export type InsertMenuItemOptionGroup = typeof menuItemOptionGroupsTable.$inferInsert;
export type MenuItemOption = typeof menuItemOptionsTable.$inferSelect;
export type InsertMenuItemOption = typeof menuItemOptionsTable.$inferInsert;
