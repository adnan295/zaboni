import { pgTable, text, unique, foreignKey } from "drizzle-orm/pg-core";
import { restaurantsTable } from "./restaurants";
import { restaurantCategoriesTable } from "./restaurant_categories";

export const categoryRestaurantExclusionsTable = pgTable(
  "category_restaurant_exclusions",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").notNull(),
    restaurantId: text("restaurant_id").notNull(),
  },
  (t) => [
    unique().on(t.categoryId, t.restaurantId),
    foreignKey({ columns: [t.categoryId], foreignColumns: [restaurantCategoriesTable.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.restaurantId], foreignColumns: [restaurantsTable.id] }).onDelete("cascade"),
  ]
);
