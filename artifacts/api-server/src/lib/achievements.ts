import { db, ordersTable, orderRatingsTable, userAchievementsTable } from "@workspace/db";
import { and, count, countDistinct, eq } from "drizzle-orm";
import { sendPushToUsers } from "./push";
import { logger } from "./logger";

export interface AchievementDef {
  key: string;
  icon: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  type: "orders" | "restaurants" | "ratings";
  threshold: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first_order",
    icon: "🌟",
    titleAr: "أول طلب",
    titleEn: "First Order",
    descriptionAr: "أكملت طلبك الأول",
    descriptionEn: "Completed your first order",
    type: "orders",
    threshold: 1,
  },
  {
    key: "loyal_customer",
    icon: "🔁",
    titleAr: "زبون وفي",
    titleEn: "Loyal Customer",
    descriptionAr: "أكملت 5 طلبات",
    descriptionEn: "Completed 5 orders",
    type: "orders",
    threshold: 5,
  },
  {
    key: "regular",
    icon: "💪",
    titleAr: "منتظم",
    titleEn: "Regular",
    descriptionAr: "أكملت 10 طلبات",
    descriptionEn: "Completed 10 orders",
    type: "orders",
    threshold: 10,
  },
  {
    key: "delivery_champion",
    icon: "🏆",
    titleAr: "بطل التوصيل",
    titleEn: "Delivery Champion",
    descriptionAr: "أكملت 25 طلباً",
    descriptionEn: "Completed 25 orders",
    type: "orders",
    threshold: 25,
  },
  {
    key: "explorer",
    icon: "🍽️",
    titleAr: "مستكشف",
    titleEn: "Explorer",
    descriptionAr: "جرّبت 5 مطاعم مختلفة",
    descriptionEn: "Tried 5 different restaurants",
    type: "restaurants",
    threshold: 5,
  },
  {
    key: "restaurant_lover",
    icon: "⭐",
    titleAr: "محبوب المطاعم",
    titleEn: "Restaurant Lover",
    descriptionAr: "جرّبت 10 مطاعم مختلفة",
    descriptionEn: "Tried 10 different restaurants",
    type: "restaurants",
    threshold: 10,
  },
  {
    key: "reviewer",
    icon: "⚡",
    titleAr: "صاحب التقييم",
    titleEn: "Reviewer",
    descriptionAr: "قيّمت 3 طلبات",
    descriptionEn: "Rated 3 orders",
    type: "ratings",
    threshold: 3,
  },
];

export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

async function getUserCounts(userId: string): Promise<{
  completedOrders: number;
  distinctRestaurants: number;
  ratingsGiven: number;
}> {
  const [ordersRow, restaurantsRow, ratingsRow] = await Promise.all([
    db
      .select({ c: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered"))),
    db
      .select({ c: countDistinct(ordersTable.restaurantId) })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, userId),
          eq(ordersTable.status, "delivered"),
        ),
      ),
    db
      .select({ c: count() })
      .from(orderRatingsTable)
      .where(eq(orderRatingsTable.userId, userId)),
  ]);

  return {
    completedOrders: Number(ordersRow[0]?.c ?? 0),
    distinctRestaurants: Number(restaurantsRow[0]?.c ?? 0),
    ratingsGiven: Number(ratingsRow[0]?.c ?? 0),
  };
}

function isEarned(def: AchievementDef, counts: { completedOrders: number; distinctRestaurants: number; ratingsGiven: number }): boolean {
  if (def.type === "orders") return counts.completedOrders >= def.threshold;
  if (def.type === "restaurants") return counts.distinctRestaurants >= def.threshold;
  if (def.type === "ratings") return counts.ratingsGiven >= def.threshold;
  return false;
}

export async function checkAndAwardAchievements(userId: string): Promise<AchievementDef[]> {
  try {
    const [counts, existingRows] = await Promise.all([
      getUserCounts(userId),
      db
        .select({ achievementKey: userAchievementsTable.achievementKey })
        .from(userAchievementsTable)
        .where(eq(userAchievementsTable.userId, userId)),
    ]);

    const existing = new Set(existingRows.map((r) => r.achievementKey));
    const newlyEarned: AchievementDef[] = [];

    for (const def of ACHIEVEMENTS) {
      if (existing.has(def.key)) continue;
      if (!isEarned(def, counts)) continue;
      newlyEarned.push(def);
    }

    if (newlyEarned.length === 0) return [];

    const now = new Date();
    await db.insert(userAchievementsTable).values(
      newlyEarned.map((def) => ({
        id: `ua_${userId}_${def.key}_${now.getTime()}`,
        userId,
        achievementKey: def.key,
        earnedAt: now,
      })),
    );

    for (const def of newlyEarned) {
      void sendPushToUsers([userId], `${def.icon} ${def.titleAr}`, def.descriptionAr, {
        type: "achievement",
        achievementKey: def.key,
      }).catch((err) => logger.warn({ err }, "[Achievements] Failed to send push"));
    }

    logger.info({ userId, keys: newlyEarned.map((d) => d.key) }, "[Achievements] Awarded");
    return newlyEarned;
  } catch (err) {
    logger.warn({ err }, "[Achievements] checkAndAwardAchievements failed");
    return [];
  }
}
