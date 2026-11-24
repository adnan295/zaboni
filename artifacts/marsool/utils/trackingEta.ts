import { Coords, haversineDistance } from "@/utils/geo";

/*
 * Fitted on 458 real Homs deliveries (pickup → delivered): a ride takes about
 * 8 fixed minutes (leaving the restaurant, parking, finding the door, handing
 * over) plus ~3 minutes per straight-line km. Distance alone explains little;
 * a pure "minutes × km" model badly underestimates short trips.
 */
const RIDE_FIXED_MINUTES = 8;
/** Once moving, only the arrival part of the fixed time is still ahead. */
const ARRIVAL_FIXED_MINUTES = 4;
const MINUTES_PER_KM = 3;
/** Typical wait at the restaurant when the courier has not collected the order yet. */
const PICKUP_MINUTES = 10;

const km = (a: Coords, b: Coords) => haversineDistance(a, b);
const ride = (a: Coords, b: Coords) => RIDE_FIXED_MINUTES + km(a, b) * MINUTES_PER_KM;
const remainingRide = (a: Coords, b: Coords) => ARRIVAL_FIXED_MINUTES + km(a, b) * MINUTES_PER_KM;

/**
 * Arrival estimate used only when the server does not send its own (older API).
 * Counts the restaurant leg while the courier still has to collect the order,
 * and measures to the delivery address — never to wherever the customer's phone
 * happens to be. Returns null rather than guess without a delivery address.
 */
export function fallbackEtaMinutes(input: {
  status: string;
  courier: Coords | null;
  restaurant: Coords | null;
  destination: Coords | null;
}): number | null {
  const { status, courier, restaurant, destination } = input;
  if (!destination) return null;

  if (status === "accepted") {
    if (restaurant) {
      const toRestaurant = courier ? km(courier, restaurant) * MINUTES_PER_KM : 0;
      return Math.max(2, Math.round(Math.max(toRestaurant, PICKUP_MINUTES) + ride(restaurant, destination)));
    }
    // Errand or unknown restaurant: the courier still has to buy and collect.
    return courier ? Math.max(2, Math.round(PICKUP_MINUTES + ride(courier, destination))) : null;
  }

  if (status === "picked_up" || status === "on_way") {
    if (courier) return Math.max(2, Math.round(remainingRide(courier, destination)));
    return restaurant ? Math.max(2, Math.round(ride(restaurant, destination))) : null;
  }

  return null;
}
