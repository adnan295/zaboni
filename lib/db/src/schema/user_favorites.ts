import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { restaurantsTable } from "./restaurants";

export const userFavoritesTable = pgTable(
  "user_favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.restaurantId] })],
);

export type UserFavorite = typeof userFavoritesTable.$inferSelect;
export type InsertUserFavorite = typeof userFavoritesTable.$inferInsert;
