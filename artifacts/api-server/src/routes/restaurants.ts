import { Router, type IRouter } from "express";
import { db, restaurantsTable, menuItemsTable, restaurantHoursTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function getDamascusNow(): { dayOfWeek: number; nowMinutes: number } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Damascus" }));
  return {
    dayOfWeek: now.getDay(),
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  };
}

function computeIsOpenFromHours(
  hours: { openTime: string; closeTime: string; isClosed: boolean } | undefined,
  fallbackIsOpen: boolean
): boolean {
  if (!hours) return fallbackIsOpen;
  if (hours.isClosed) return false;
  const [oh = 0, om = 0] = hours.openTime.split(":").map(Number);
  const [ch = 0, cm = 0] = hours.closeTime.split(":").map(Number);
  const { nowMinutes } = getDamascusNow();
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;
  if (openMinutes <= closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

async function getHoursForRestaurants(ids: string[], dayOfWeek: number): Promise<Map<string, { openTime: string; closeTime: string; isClosed: boolean }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(restaurantHoursTable)
    .where(
      and(
        sql`${restaurantHoursTable.restaurantId} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}])`,
        eq(restaurantHoursTable.dayOfWeek, dayOfWeek)
      )
    );
  return new Map(rows.map((h) => [h.restaurantId, { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed }]));
}

router.get("/restaurants", async (req, res) => {
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const category = typeof req.query["category"] === "string" ? req.query["category"].trim() : "";

  let query = db.select().from(restaurantsTable).$dynamic();

  const conditions = [];
  if (search) {
    conditions.push(
      sql`(${restaurantsTable.name} ILIKE ${"%" + search + "%"} OR ${restaurantsTable.nameAr} ILIKE ${"%" + search + "%"} OR ${restaurantsTable.category} ILIKE ${"%" + search + "%"} OR ${restaurantsTable.categoryAr} ILIKE ${"%" + search + "%"})`
    );
  }
  if (category) {
    conditions.push(
      sql`(${restaurantsTable.category} ILIKE ${"%" + category + "%"} OR ${restaurantsTable.categoryAr} ILIKE ${"%" + category + "%"})`
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = await query.orderBy(desc(restaurantsTable.rating));
  const { dayOfWeek } = getDamascusNow();
  const hoursMap = await getHoursForRestaurants(rows.map((r) => r.id), dayOfWeek);

  const result = rows.map((r) => ({
    ...r,
    isOpen: computeIsOpenFromHours(hoursMap.get(r.id), r.isOpen),
  }));

  res.json(result);
});

router.get("/restaurants/:id", async (req, res) => {
  const { id } = req.params;
  const rows = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, id));
  if (rows.length === 0) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }

  const restaurant = rows[0]!;
  const { dayOfWeek } = getDamascusNow();
  const hoursMap = await getHoursForRestaurants([restaurant.id], dayOfWeek);
  const isOpen = computeIsOpenFromHours(hoursMap.get(restaurant.id), restaurant.isOpen);

  res.json({ ...restaurant, isOpen });
});

router.get("/restaurants/:id/menu", async (req, res) => {
  const { id } = req.params;
  const items = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.restaurantId, id));
  res.json(items);
});

export default router;
