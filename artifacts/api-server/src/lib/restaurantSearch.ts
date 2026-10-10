/** Treat search input literally, not as SQL LIKE wildcards. */
export function literalSearchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

type SearchableRestaurant = { isOpen: boolean; deliveryFee: number; rating: number; deliveryTime: string };
export function applyRestaurantSearchOptions<T extends SearchableRestaurant>(rows: T[], options: Record<string, unknown>): T[] {
  const minRating = typeof options.minRating === "string" && options.minRating.trim() ? Number(options.minRating) : NaN;
  const filtered = rows.filter(row =>
    (options.openOnly !== "1" || row.isOpen) &&
    (options.freeDelivery !== "1" || row.deliveryFee === 0) &&
    (!Number.isFinite(minRating) || row.rating >= minRating));
  const minutes = (value: string) => {
    const parsed = Number.parseFloat(value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)));
    return Number.isFinite(parsed) ? parsed : Infinity;
  };
  if (options.sortBy === "rating") filtered.sort((a,b) => b.rating-a.rating);
  if (options.sortBy === "delivery_fee") filtered.sort((a,b) => a.deliveryFee-b.deliveryFee);
  if (options.sortBy === "fastest") filtered.sort((a,b) => minutes(a.deliveryTime)-minutes(b.deliveryTime));
  const limit = typeof options.limit === "string" ? Number(options.limit) : NaN;
  return Number.isInteger(limit) && limit > 0 ? filtered.slice(0, Math.min(limit, 200)) : filtered;
}

/** Known distances first; equal or missing distances retain the existing tie-breakers. */
export function compareRestaurantDistance(a: {distanceKm?: number | null}, b: {distanceKm?: number | null}): number {
  const valid = (distance: number | null | undefined) => typeof distance === "number" && Number.isFinite(distance) && distance >= 0;
  const aKnown = valid(a.distanceKm), bKnown = valid(b.distanceKm);
  if (aKnown && bKnown) return a.distanceKm! - b.distanceKm!;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  return 0;
}
