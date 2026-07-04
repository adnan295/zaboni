import { db } from "../index";
import { sql } from "drizzle-orm";

const SEED_ACHIEVEMENTS = [
  {
    id: "ach_first_order",
    key: "first_order",
    title_ar: "أول طلب",
    title_en: "First Order",
    description_ar: "أكملت طلبك الأول",
    description_en: "Completed your first order",
    icon: "🌟",
    condition: JSON.stringify({ type: "orders", threshold: 1 }),
  },
  {
    id: "ach_loyal_customer",
    key: "loyal_customer",
    title_ar: "زبون وفي",
    title_en: "Loyal Customer",
    description_ar: "أكملت 5 طلبات",
    description_en: "Completed 5 orders",
    icon: "🔁",
    condition: JSON.stringify({ type: "orders", threshold: 5 }),
  },
  {
    id: "ach_regular",
    key: "regular",
    title_ar: "منتظم",
    title_en: "Regular",
    description_ar: "أكملت 10 طلبات",
    description_en: "Completed 10 orders",
    icon: "💪",
    condition: JSON.stringify({ type: "orders", threshold: 10 }),
  },
  {
    id: "ach_delivery_champion",
    key: "delivery_champion",
    title_ar: "بطل التوصيل",
    title_en: "Delivery Champion",
    description_ar: "أكملت 25 طلباً",
    description_en: "Completed 25 orders",
    icon: "🏆",
    condition: JSON.stringify({ type: "orders", threshold: 25 }),
  },
  {
    id: "ach_explorer",
    key: "explorer",
    title_ar: "مستكشف",
    title_en: "Explorer",
    description_ar: "جرّبت 5 مطاعم مختلفة",
    description_en: "Tried 5 different restaurants",
    icon: "🍽️",
    condition: JSON.stringify({ type: "restaurants", threshold: 5 }),
  },
  {
    id: "ach_restaurant_lover",
    key: "restaurant_lover",
    title_ar: "محبوب المطاعم",
    title_en: "Restaurant Lover",
    description_ar: "جرّبت 10 مطاعم مختلفة",
    description_en: "Tried 10 different restaurants",
    icon: "⭐",
    condition: JSON.stringify({ type: "restaurants", threshold: 10 }),
  },
  {
    id: "ach_reviewer",
    key: "reviewer",
    title_ar: "صاحب التقييم",
    title_en: "Reviewer",
    description_ar: "قيّمت 3 طلبات",
    description_en: "Rated 3 orders",
    icon: "⚡",
    condition: JSON.stringify({ type: "ratings", threshold: 3 }),
  },
];

export async function addUserAchievements() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      title_ar TEXT NOT NULL,
      title_en TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_en TEXT NOT NULL,
      icon TEXT NOT NULL,
      condition JSONB NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_achievements_user_key_unique UNIQUE (user_id, achievement_key)
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_achievements_user_id_idx ON user_achievements(user_id)
  `);

  for (const ach of SEED_ACHIEVEMENTS) {
    await db.execute(sql`
      INSERT INTO achievements (id, key, title_ar, title_en, description_ar, description_en, icon, condition)
      VALUES (
        ${ach.id},
        ${ach.key},
        ${ach.title_ar},
        ${ach.title_en},
        ${ach.description_ar},
        ${ach.description_en},
        ${ach.icon},
        ${ach.condition}::jsonb
      )
      ON CONFLICT (key) DO NOTHING
    `);
  }

  console.log("[migration] achievements + user_achievements tables ensured.");
}
