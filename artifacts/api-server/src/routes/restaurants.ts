import { Router, type IRouter, type Request } from "express";
import { db, restaurantsTable, menuItemsTable, restaurantHoursTable, promoBannersTable, restaurantCategoriesTable, restaurantCategorySortOrdersTable, homeSectionItemsTable, categoryRestaurantExclusionsTable, flashDealsTable } from "@workspace/db";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";

const router: IRouter = Router();

function resolveImageUrl(imageUrl: string | null | undefined, req: Request): string | null | undefined {
  if (!imageUrl || imageUrl.startsWith("http")) return imageUrl;
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}${imageUrl}`;
  }
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  return `${proto}://${host}${imageUrl}`;
}

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
  const categoryId = typeof req.query["categoryId"] === "string" ? req.query["categoryId"].trim() : "";
  const lat = typeof req.query["lat"] === "string" ? parseFloat(req.query["lat"]) : null;
  const lon = typeof req.query["lon"] === "string" ? parseFloat(req.query["lon"]) : null;
  const hasLocation = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon);
  const hasCategoryId = categoryId && categoryId !== "all";

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

  // Filter out restaurants excluded from this category
  if (hasCategoryId) {
    const excluded = await db
      .select({ restaurantId: categoryRestaurantExclusionsTable.restaurantId })
      .from(categoryRestaurantExclusionsTable)
      .where(eq(categoryRestaurantExclusionsTable.categoryId, categoryId));
    if (excluded.length > 0) {
      const excludedIds = excluded.map((e) => e.restaurantId);
      query = query.where(notInArray(restaurantsTable.id, excludedIds));
    }
  }

  const rows = await query;

  let categorySortMap = new Map<string, number>();
  if (hasCategoryId) {
    const catSortRows = await db
      .select()
      .from(restaurantCategorySortOrdersTable)
      .where(eq(restaurantCategorySortOrdersTable.categoryId, categoryId));
    for (const r of catSortRows) {
      categorySortMap.set(r.restaurantId, r.sortOrder);
    }
  }

  const { dayOfWeek, prevDayOfWeek, nowMinutes } = getDamascusNow();
  const hoursMap = await getHoursForRestaurants(rows.map((r) => r.id), [dayOfWeek, prevDayOfWeek]);

  const now = new Date();
  const activeFlashDealRows = rows.length > 0
    ? await db
        .select({ restaurantId: flashDealsTable.restaurantId })
        .from(flashDealsTable)
        .where(
          and(
            eq(flashDealsTable.isActive, true),
            lte(flashDealsTable.startsAt, now),
            gt(flashDealsTable.endsAt, now),
            inArray(flashDealsTable.restaurantId, rows.map((r) => r.id)),
            or(isNull(flashDealsTable.maxUses), lt(flashDealsTable.usedCount, flashDealsTable.maxUses))
          )
        )
    : [];
  const flashDealRestaurantIds = new Set(activeFlashDealRows.map((f) => f.restaurantId));

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
      categorySortOrder: hasCategoryId ? (categorySortMap.get(r.id) ?? null) : null,
      hasFlashDeal: flashDealRestaurantIds.has(r.id),
    };
  });

  result.sort((a, b) => {
    if (hasCategoryId) {
      // 1. category-specific order (nulls last)
      const aCs = a.categorySortOrder ?? null;
      const bCs = b.categorySortOrder ?? null;
      if (aCs !== null && bCs !== null) return aCs - bCs;
      if (aCs !== null) return -1;
      if (bCs !== null) return 1;
      // 2. global sortOrder fallback (nulls last)
      const aSo = a.sortOrder ?? null;
      const bSo = b.sortOrder ?? null;
      if (aSo !== null && bSo !== null) return aSo - bSo;
      if (aSo !== null) return -1;
      if (bSo !== null) return 1;
      // 3. rating desc
      return b.rating - a.rating;
    } else {
      // global mode: sortOrder (nulls last) → distance → rating
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
    }
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

router.get("/restaurants/:id/flash-deal", async (req, res) => {
  const { id } = req.params;
  const now = new Date();
  const [deal] = await db
    .select()
    .from(flashDealsTable)
    .where(
      and(
        eq(flashDealsTable.restaurantId, id),
        eq(flashDealsTable.isActive, true),
        lte(flashDealsTable.startsAt, now),
        gt(flashDealsTable.endsAt, now),
        or(isNull(flashDealsTable.maxUses), lt(flashDealsTable.usedCount, flashDealsTable.maxUses))
      )
    )
    .limit(1);
  res.json(deal ?? null);
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

router.get("/categories", async (req, res) => {
  const rows = await db
    .select()
    .from(restaurantCategoriesTable)
    .where(eq(restaurantCategoriesTable.isActive, true))
    .orderBy(asc(restaurantCategoriesTable.sortOrder));
  res.json(rows.map((r) => ({ ...r, imageUrl: resolveImageUrl(r.imageUrl, req) })));
});

router.get("/home-sections/:section", async (req, res) => {
  const section = String(req.params["section"]);
  if (section !== "popular" && section !== "deals") {
    res.status(400).json({ error: "Invalid section" });
    return;
  }

  const manualItems = await db
    .select({ restaurantId: homeSectionItemsTable.restaurantId })
    .from(homeSectionItemsTable)
    .where(eq(homeSectionItemsTable.section, section))
    .orderBy(asc(homeSectionItemsTable.sortOrder));

  let restaurantIds: string[] = manualItems.map((i) => i.restaurantId);

  const flashRestaurantIds = new Set<string>();

  if (section === "deals") {
    const now = new Date();
    const [dealItems, flashItems] = await Promise.all([
      db
        .select({ restaurantId: menuItemsTable.restaurantId })
        .from(menuItemsTable)
        .where(eq(menuItemsTable.isDeal, true)),
      db
        .select({ restaurantId: flashDealsTable.restaurantId })
        .from(flashDealsTable)
        .where(
          and(
            eq(flashDealsTable.isActive, true),
            lte(flashDealsTable.startsAt, now),
            gt(flashDealsTable.endsAt, now),
            or(isNull(flashDealsTable.maxUses), lt(flashDealsTable.usedCount, flashDealsTable.maxUses))
          )
        ),
    ]);
    const dealRestaurantIds = [...new Set(dealItems.map((i) => i.restaurantId))];
    for (const f of flashItems) flashRestaurantIds.add(f.restaurantId);
    const combined = [...new Set([...restaurantIds, ...dealRestaurantIds, ...flashRestaurantIds])];
    restaurantIds = combined;
  }

  if (restaurantIds.length === 0) {
    res.json([]);
    return;
  }

  const restaurants = await db
    .select()
    .from(restaurantsTable)
    .where(inArray(restaurantsTable.id, restaurantIds));

  const map = new Map(restaurants.map((r) => [r.id, r]));
  const ordered = restaurantIds
    .map((id) => {
      const r = map.get(id);
      if (!r) return null;
      return { ...r, hasFlashDeal: flashRestaurantIds.has(id) };
    })
    .filter(Boolean);
  res.json(ordered);
});

export default router;

