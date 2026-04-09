import { db, deliveryZonesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

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

export const DEFAULT_DELIVERY_FEE_SYP = 5000;

export async function getFeeForDistance(distanceKm: number): Promise<{ fee: number; zone: typeof deliveryZonesTable.$inferSelect | null }> {
  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.isActive, true))
    .orderBy(asc(deliveryZonesTable.fromKm));

  for (const zone of zones) {
    if (distanceKm >= zone.fromKm && distanceKm < zone.toKm) {
      return { fee: zone.fee, zone };
    }
  }

  if (zones.length === 0) {
    return { fee: DEFAULT_DELIVERY_FEE_SYP, zone: null };
  }

  const lastZone = zones[zones.length - 1]!;
  if (distanceKm >= lastZone.toKm) {
    return { fee: lastZone.fee, zone: lastZone };
  }

  return { fee: DEFAULT_DELIVERY_FEE_SYP, zone: null };
}
