import { db, deliveryZonesTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const DAMASCUS_CENTER_LAT = 34.7324;
export const DAMASCUS_CENTER_LON = 36.7137;

export const DEFAULT_DELIVERY_FEE_SYP = 5000;

export type ZoneFeeResult =
  | { found: true; fee: number; zone: typeof deliveryZonesTable.$inferSelect }
  | { found: false; fee: number; zone: null };

export async function getFeeForDistance(distanceKm: number): Promise<ZoneFeeResult> {
  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.isActive, true))
    .orderBy(asc(deliveryZonesTable.fromKm));

  for (const zone of zones) {
    if (distanceKm >= zone.fromKm && distanceKm < zone.toKm) {
      return { found: true, fee: zone.fee, zone };
    }
  }

  if (zones.length === 0) {
    return { found: false, fee: DEFAULT_DELIVERY_FEE_SYP, zone: null };
  }

  const highestZone = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.isActive, true))
    .orderBy(desc(deliveryZonesTable.fee))
    .limit(1);

  const fallbackZone = highestZone[0] ?? null;
  return {
    found: false,
    fee: fallbackZone?.fee ?? DEFAULT_DELIVERY_FEE_SYP,
    zone: null,
  };
}
