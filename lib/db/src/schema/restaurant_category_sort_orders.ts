import { pgTable, text, integer, unique } from "drizzle-orm/pg-core";

export const restaurantCategorySortOrdersTable = pgTable(
  "restaurant_category_sort_orders",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id").notNull(),
    categoryId: text("category_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [unique().on(t.restaurantId, t.categoryId)]
);
