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

export const DAMASCUS_CENTER_LAT = 34.7324;
export const DAMASCUS_CENTER_LON = 36.7137;

export const DEFAULT_DELIVERY_FEE_SYP = 5000;

export const ROAD_DISTANCE_FACTOR = 1.35;

/**
 * The distance the fee is priced on: the real road distance when OSRM measured it,
 * otherwise the straight line times ROAD_DISTANCE_FACTOR (the old estimate).
 */
export function pricedKm(straightKm: number, roadKm?: number | null): number {
  return roadKm != null && Number.isFinite(roadKm) ? roadKm : straightKm * ROAD_DISTANCE_FACTOR;
}

export type ZoneFeeResult =
  | { found: true; outOfRange: false; fee: number; zone: typeof deliveryZonesTable.$inferSelect }
  | { found: false; outOfRange: boolean; fee: number; zone: null };

/**
 * Resolve the delivery fee for a trip: its straight-line distance, and the road
 * distance when OSRM could measure it (see pricedKm).
 *
 * `outOfRange` is true only when delivery zones ARE configured and the location
 * is beyond the furthest one — i.e. genuinely outside the coverage area, so the
 * order should be rejected. When no zones are configured we never flag
 * out-of-range (coverage is effectively unlimited) and fall back to the default
 * fee, so enabling this check can't accidentally block every order.
 */
export async function getFeeForDistance(distanceKm: number, roadKm?: number | null): Promise<ZoneFeeResult> {
  const effectiveKm = pricedKm(distanceKm, roadKm);

  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.isActive, true))
    .orderBy(asc(deliveryZonesTable.fromKm));

  for (const zone of zones) {
    if (effectiveKm >= zone.fromKm && effectiveKm < zone.toKm) {
      return { found: true, outOfRange: false, fee: zone.fee, zone };
    }
  }

  if (zones.length === 0) {
    // No coverage configured → don't gate anything; charge the default fee.
    return { found: false, outOfRange: false, fee: DEFAULT_DELIVERY_FEE_SYP, zone: null };
  }

  // Zones exist but none matched. Only treat it as out-of-range when the
  // location is past the furthest zone; an unserved gap between zones still
  // gets served at the highest configured fee.
  const maxToKm = Math.max(...zones.map((z) => z.toKm));
  const highestFee = Math.max(...zones.map((z) => z.fee));
  return {
    found: false,
    outOfRange: effectiveKm >= maxToKm,
    fee: highestFee,
    zone: null,
  };
}

/**
 * Build a delivery-fee calculator once (zones fetched a single time) so many
 * restaurants can be priced in one pass without a query each. The returned fee
 * matches getFeeForDistance exactly, so the restaurant list shows the same fee
 * the customer pays at checkout.
 */
export async function makeFeeCalculator(): Promise<(distanceKm: number, roadKm?: number | null) => number> {
  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.isActive, true))
    .orderBy(asc(deliveryZonesTable.fromKm));
  const highestFee = zones.length ? Math.max(...zones.map((z) => z.fee)) : DEFAULT_DELIVERY_FEE_SYP;
  return (distanceKm: number, roadKm?: number | null): number => {
    const effectiveKm = pricedKm(distanceKm, roadKm);
    for (const zone of zones) {
      if (effectiveKm >= zone.fromKm && effectiveKm < zone.toKm) return zone.fee;
    }
    return zones.length === 0 ? DEFAULT_DELIVERY_FEE_SYP : highestFee;
  };
}
