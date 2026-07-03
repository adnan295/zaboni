import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const promoImagesTable = pgTable("promo_images", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  restaurantName: text("restaurant_name").notNull(),
  foodImageUrl: text("food_image_url"),
  oldPrice: text("old_price").notNull(),
  newPrice: text("new_price").notNull(),
  tagline: text("tagline"),
  resultUrl: text("result_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  templateId: text("template_id").notNull().default("classic-red"),
});

export const insertPromoImageSchema = createInsertSchema(promoImagesTable);
export const selectPromoImageSchema = createSelectSchema(promoImagesTable);

export type PromoImage = typeof promoImagesTable.$inferSelect;
export type InsertPromoImage = typeof promoImagesTable.$inferInsert;
