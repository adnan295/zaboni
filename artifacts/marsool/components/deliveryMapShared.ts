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

/** The tracking line: dark red for the courier's current/covered stretch, light red for what comes after. */
export interface TripLine {
  done: Coords[];
  left: Coords[];
}

export type Leg = [Coords, Coords];

/**
 * Which stretches the map draws for an order state.
 *  - going to the restaurant: courier → restaurant (dark), restaurant → home (light)
 *  - carrying the order:      restaurant → courier (dark), courier → home (light)
 * A missing point just drops the stretch that needs it.
 */
export function tripLegs(
  status: string,
  courier: Coords | null,
  restaurant: Coords | null,
  home: Coords | null,
): { done: Leg | null; left: Leg | null } {
  if (status === "accepted") {
    return {
      done: courier && restaurant ? [courier, restaurant] : null,
      left: restaurant && home ? [restaurant, home] : courier && home ? [courier, home] : null,
    };
  }
  if (status === "picked_up" || status === "on_way") {
    return {
      done: restaurant && courier ? [restaurant, courier] : null,
      left: courier && home ? [courier, home] : restaurant && home ? [restaurant, home] : null,
    };
  }
  return { done: null, left: null };
}

// Zaboni's map look: the street map washed out to a soft grey-beige so the red
// route and the pins are what the eye finds first. Used by the web/Android
// (Leaflet) maps; iOS uses Apple's muted map style instead.
export const MAP_GROUND = "#EEF0EC";
export const TILE_FILTER = "grayscale(0.9) sepia(0.12) brightness(1.06) contrast(0.88)";
export const ROUTE_DARK = "#DC2626";
export const ROUTE_LIGHT = "#FCA5A5";

const svg = (path: string, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

/** Pin markup for the Leaflet maps, matching the native pins. */
export const PIN_HTML = {
  restaurant:
    `<div style="width:32px;height:32px;border-radius:50%;background:#111827;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;box-sizing:border-box">${svg('<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6M3 3v6a4 4 0 0 0 4 4M17 21V3c2 1 3 4 3 8h-3"/>', 15)}</div>`,
  home:
    `<div style="display:flex;flex-direction:column;align-items:center"><div style="width:34px;height:34px;border-radius:50%;background:#DC2626;border:3px solid #fff;box-shadow:0 3px 6px rgba(220,38,38,.35);display:flex;align-items:center;justify-content:center;box-sizing:border-box">${svg('<path d="M3 11l9-7 9 7v9H3z"/>', 15)}</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #DC2626;margin-top:-1px"></div></div>`,
  courier:
    `<div style="width:52px;height:52px;border-radius:50%;background:rgba(220,38,38,.18);display:flex;align-items:center;justify-content:center"><div style="width:38px;height:38px;border-radius:50%;background:#fff;border:2.5px solid #DC2626;box-shadow:0 3px 8px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;box-sizing:border-box"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-2-7h-3M13 10h3l2 7M4 11h5"/></svg></div></div>`,
};
