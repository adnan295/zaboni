import { Router, type IRouter } from "express";
import { db, restaurantsTable, menuItemsTable, restaurantHoursTable, promoBannersTable, restaurantCategoriesTable } from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

const router: IRouter = Router();

function getDamascusNow(): { dayOfWeek: number; prevDayOfWeek: number; nowMinutes: number } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Damascus" }));
  const dayOfWeek = now.getDay();
  return {
    dayOfWeek,
    prevDayOfWeek: (dayOfWeek + 6) % 7,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  };
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function computeIsOpenFromHours(
  todayHours: { openTime: string; closeTime: string; isClosed: boolean } | undefined,
  prevDayHours: { openTime: string; closeTime: string; isClosed: boolean } | undefined,
  nowMinutes: number,
  fallbackIsOpen: boolean
): boolean {
  if (!todayHours && !prevDayHours) return fallbackIsOpen;

  if (prevDayHours && !prevDayHours.isClosed) {
    const openMinutes = parseTimeToMinutes(prevDayHours.openTime);
    const closeMinutes = parseTimeToMinutes(prevDayHours.closeTime);
    if (openMinutes > closeMinutes && nowMinutes < closeMinutes) {
      return true;
    }
  }

  if (!todayHours) return fallbackIsOpen;
  if (todayHours.isClosed) return false;

  const openMinutes = parseTimeToMinutes(todayHours.openTime);
  const closeMinutes = parseTimeToMinutes(todayHours.closeTime);
  if (openMinutes <= closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

type HoursRow = { openTime: string; closeTime: string; isClosed: boolean };

async function getHoursForRestaurants(ids: string[], days: number[]): Promise<Map<string, Map<number, HoursRow>>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(restaurantHoursTable)
    .where(
      and(
        inArray(restaurantHoursTable.restaurantId, ids),
        inArray(restaurantHoursTable.dayOfWeek, days)
      )
    );
  const result = new Map<string, Map<number, HoursRow>>();
  for (const h of rows) {
    if (!result.has(h.restaurantId)) result.set(h.restaurantId, new Map());
    result.get(h.restaurantId)!.set(h.dayOfWeek, { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed });
  }
  return result;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/restaurants", async (req, res) => {
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const category = typeof req.query["category"] === "string" ? req.query["category"].trim() : "";
  const lat = typeof req.query["lat"] === "string" ? parseFloat(req.query["lat"]) : null;
  const lon = typeof req.query["lon"] === "string" ? parseFloat(req.query["lon"]) : null;
  const hasLocation = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon);

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

  const rows = await query;
  const { dayOfWeek, prevDayOfWeek, nowMinutes } = getDamascusNow();
  const hoursMap = await getHoursForRestaurants(rows.map((r) => r.id), [dayOfWeek, prevDayOfWeek]);

  const result = rows.map((r) => {
    const byDay = hoursMap.get(r.id);
    const distanceKm =
      hasLocation && r.lat != null && r.lon != null
        ? haversineKm(lat!, lon!, r.lat, r.lon)
        : null;
    return {
      ...r,
      isOpen: computeIsOpenFromHours(byDay?.get(dayOfWeek), byDay?.get(prevDayOfWeek), nowMinutes, r.isOpen),
      distanceKm,
    };
  });

  result.sort((a, b) => {
    const aPriority = a.sortOrder ?? null;
    const bPriority = b.sortOrder ?? null;

    if (aPriority !== null && bPriority !== null) return aPriority - bPriority;
    if (aPriority !== null) return -1;
    if (bPriority !== null) return 1;

    if (hasLocation) {
      const aDist = a.distanceKm ?? Infinity;
      const bDist = b.distanceKm ?? Infinity;
      if (Math.abs(aDist - bDist) > 0.1) return aDist - bDist;
    }

    return b.rating - a.rating;
  });

  res.json(result);
});

router.get("/restaurants/food-categories", async (_req, res) => {
  const rows = await db
    .selectDistinct({ categoryAr: restaurantsTable.categoryAr })
    .from(restaurantsTable)
    .orderBy(asc(restaurantsTable.categoryAr));
  const filtered = rows
    .map((r) => r.categoryAr?.trim())
    .filter((v): v is string => !!v);
  const unique = [...new Set(filtered)];
  res.json(unique.map((v) => ({ categoryAr: v })));
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
  const { dayOfWeek, prevDayOfWeek, nowMinutes } = getDamascusNow();
  const hoursMap = await getHoursForRestaurants([restaurant.id], [dayOfWeek, prevDayOfWeek]);
  const byDay = hoursMap.get(restaurant.id);
  const isOpen = computeIsOpenFromHours(byDay?.get(dayOfWeek), byDay?.get(prevDayOfWeek), nowMinutes, restaurant.isOpen);

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


router.get("/banners", async (_req, res) => {
  const rows = await db
    .select()
    .from(promoBannersTable)
    .where(eq(promoBannersTable.isActive, true))
    .orderBy(asc(promoBannersTable.sortOrder));
  res.json(rows);
});

router.get("/categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(restaurantCategoriesTable)
    .where(eq(restaurantCategoriesTable.isActive, true))
    .orderBy(asc(restaurantCategoriesTable.sortOrder));
  res.json(rows);
});

export default router;

