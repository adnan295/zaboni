import { haversineKm } from "./deliveryZones";
export const MAX_VISIBLE_RADIUS_KM = 15;
export function canReceiveNewOrder(statuses: string[]): boolean {
  return (
    statuses.length < 2 &&
    statuses.every((s) => s === "picked_up" || s === "on_way")
  );
}
export function isWithinOrderRadius(
  lat: number | null,
  lon: number | null,
  restaurantLat: number | null,
  restaurantLon: number | null,
): boolean {
  return (
    lat === null ||
    lon === null ||
    restaurantLat === null ||
    restaurantLon === null ||
    haversineKm(lat, lon, restaurantLat, restaurantLon) <= MAX_VISIBLE_RADIUS_KM
  );
}
