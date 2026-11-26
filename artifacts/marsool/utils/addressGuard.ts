// "I forgot to change the address": the customer orders while away from home and
// the courier drives to the old address. Before sending, the app compares where
// the phone is now with the address chosen for delivery — on the phone only —
// and asks once when they are far apart.

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** Further than this from the chosen address and we ask before sending. */
export const FAR_FROM_ADDRESS_METERS = 500;
/** A GPS fix with worse accuracy than this is too vague to judge by. */
export const MAX_FIX_ACCURACY_METERS = 300;

const toRad = (d: number) => (d * Math.PI) / 180;

export function metersBetween(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How far the phone is from the delivery address, when that is worth asking
 * about; null when it is close enough or the GPS fix cannot be trusted.
 */
export function farFromAddress(
  phone: (LatLon & { accuracy?: number | null }) | null,
  address: LatLon | null,
  threshold = FAR_FROM_ADDRESS_METERS,
): number | null {
  if (!phone || !address) return null;
  if (phone.accuracy != null && phone.accuracy > MAX_FIX_ACCURACY_METERS) return null;
  const m = metersBetween(phone, address);
  return m > threshold ? m : null;
}

/** «350 م» under a kilometre, «3 كم» / «1.4 كم» above. */
export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 50) * 50} م`;
  const km = meters / 1000;
  return `${km < 10 ? Math.round(km * 10) / 10 : Math.round(km)} كم`;
}
