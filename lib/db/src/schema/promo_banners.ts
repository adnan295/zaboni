import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const promoBannersTable = pgTable("promo_banners", {
  id: text("id").primaryKey(),
  image: text("image").default(""),
  restaurantId: text("restaurant_id"),
  titleAr: text("title_ar").notNull().default(""),
  titleEn: text("title_en").notNull().default(""),
  subtitleAr: text("subtitle_ar").notNull().default(""),
  subtitleEn: text("subtitle_en").notNull().default(""),
  iconName: text("icon_name").notNull().default("local-offer"),
  bgColor: text("bg_color").notNull().default("#FF6B00"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPromoBannerSchema = createInsertSchema(promoBannersTable);
export const selectPromoBannerSchema = createSelectSchema(promoBannersTable);

export type PromoBanner = typeof promoBannersTable.$inferSelect;
export type InsertPromoBanner = typeof promoBannersTable.$inferInsert;
