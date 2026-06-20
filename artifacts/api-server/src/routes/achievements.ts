import { Router, type IRouter } from "express";
import { db, userAchievementsTable, ordersTable, orderRatingsTable, achievementsTable } from "@workspace/db";
import { and, count, countDistinct, eq } from "drizzle-orm";
import { checkAndAwardAchievements } from "../lib/achievements";

const router: IRouter = Router();

router.get("/users/me/achievements", async (req, res) => {
  const userId = req.auth!.userId;

  const existingCountRow = await db
    .select({ c: count() })
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId));
  const existingCount = Number(existingCountRow[0]?.c ?? 0);

  if (existingCount === 0) {
    await checkAndAwardAchievements(userId);
  }

  const [definitions, earnedRows, completedOrdersRow, distinctRestaurantsRow, ratingsRow] = await Promise.all([
    db.select().from(achievementsTable),
    db
      .select()
      .from(userAchievementsTable)
      .where(eq(userAchievementsTable.userId, userId)),
    db
      .select({ c: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered"))),
    db
      .select({ c: countDistinct(ordersTable.restaurantId) })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered"))),
    db
      .select({ c: count() })
      .from(orderRatingsTable)
      .where(eq(orderRatingsTable.userId, userId)),
  ]);

  const completedOrders = Number(completedOrdersRow[0]?.c ?? 0);
  const distinctRestaurants = Number(distinctRestaurantsRow[0]?.c ?? 0);
  const ratingsGiven = Number(ratingsRow[0]?.c ?? 0);

  const earnedSet = new Map(earnedRows.map((r) => [r.achievementKey, r.earnedAt]));

  const achievements = definitions.map((def) => {
    const condition = def.condition as { type: string; threshold: number };
    const earned = earnedSet.has(def.key);

    let current = 0;
    if (condition.type === "orders") current = completedOrders;
    else if (condition.type === "restaurants") current = distinctRestaurants;
    else if (condition.type === "ratings") current = ratingsGiven;

    return {
      key: def.key,
      icon: def.icon,
      titleAr: def.titleAr,
      titleEn: def.titleEn,
      descriptionAr: def.descriptionAr,
      descriptionEn: def.descriptionEn,
      type: condition.type,
      threshold: condition.threshold,
      earned,
      earnedAt: earned ? earnedSet.get(def.key)!.toISOString() : null,
      progress: Math.min(current, condition.threshold),
    };
  });

  res.json({ achievements, completedOrders, distinctRestaurants, ratingsGiven });
});

export default router;
