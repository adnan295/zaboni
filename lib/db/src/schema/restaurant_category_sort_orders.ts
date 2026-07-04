import { pgTable, text, integer, unique, foreignKey } from "drizzle-orm/pg-core";
import { restaurantsTable } from "./restaurants";
import { restaurantCategoriesTable } from "./restaurant_categories";

export const restaurantCategorySortOrdersTable = pgTable(
  "restaurant_category_sort_orders",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id").notNull(),
    categoryId: text("category_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    unique().on(t.restaurantId, t.categoryId),
    foreignKey({ columns: [t.restaurantId], foreignColumns: [restaurantsTable.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.categoryId], foreignColumns: [restaurantCategoriesTable.id] }).onDelete("cascade"),
  ]
);
