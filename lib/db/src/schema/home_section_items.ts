import { pgTable, text, integer, unique, foreignKey } from "drizzle-orm/pg-core";
import { restaurantsTable } from "./restaurants";

export const homeSectionItemsTable = pgTable(
  "home_section_items",
  {
    id: text("id").primaryKey(),
    section: text("section").notNull(), // "popular" | "deals"
    restaurantId: text("restaurant_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique().on(t.section, t.restaurantId),
    foreignKey({ columns: [t.restaurantId], foreignColumns: [restaurantsTable.id] }).onDelete("cascade"),
  ]
);
