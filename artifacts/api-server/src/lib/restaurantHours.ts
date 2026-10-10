import { db, restaurantHoursTable } from "@workspace/db";
import { and, inArray } from "drizzle-orm";

export function getDamascusNow(): { dayOfWeek: number; prevDayOfWeek: number; nowMinutes: number } {
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

export function computeIsOpenFromHours(
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
  // The early-morning portion belongs to yesterday's shift, checked above.
  return nowMinutes >= openMinutes;
}

type HoursRow = { openTime: string; closeTime: string; isClosed: boolean };

export async function getHoursForRestaurants(ids: string[], days: number[]): Promise<Map<string, Map<number, HoursRow>>> {
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

