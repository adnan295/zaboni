import type { Coords } from "@/utils/geo";

/**
 * Changes only when a point first appears (or the delivery/restaurant point
 * moves), never on a plain courier ping. The maps re-frame the trip on this key,
 * so the camera settles once instead of jumping every few seconds.
 */
export function mapFrameKey(destination: Coords | null, restaurant: Coords | null, courier: Coords | null): string {
  const p = (c: Coords | null) => (c ? `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}` : "-");
  return `${p(destination)}|${p(restaurant)}|${courier ? "c" : "-"}`;
}
