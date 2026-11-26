import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { Coords } from "@/utils/geo";
import { tripLegs, type Leg, type TripLine } from "@/components/deliveryMapShared";

type Pair = [number, number];

async function streets(leg: Leg): Promise<Coords[]> {
  const pts = leg.map((c) => `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`).join(";");
  try {
    const r = (await customFetch(`/api/route?points=${encodeURIComponent(pts)}`)) as { coords?: Pair[] };
    if (r?.coords && r.coords.length >= 2) return r.coords.map(([latitude, longitude]) => ({ latitude, longitude }));
  } catch {}
  return leg;
}

// ~110 m: the line is looked up again when the courier has really moved, not on every ping.
const rough = (c: Coords | null) => (c ? `${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}` : "-");

/** The tracking line along the streets; straight segments until (or unless) the roads arrive. */
export function useTripRoute(
  status: string,
  courier: Coords | null,
  restaurant: Coords | null,
  home: Coords | null,
): TripLine | null {
  const legs = tripLegs(status, courier, restaurant, home);
  const straight: TripLine | null = legs.done || legs.left ? { done: legs.done ?? [], left: legs.left ?? [] } : null;
  const { data } = useQuery({
    queryKey: ["trip-route", status, rough(courier), rough(restaurant), rough(home)],
    enabled: !!straight,
    queryFn: async (): Promise<TripLine> => {
      const [done, left] = await Promise.all([
        legs.done ? streets(legs.done) : Promise.resolve([]),
        legs.left ? streets(legs.left) : Promise.resolve([]),
      ]);
      return { done, left };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  if (!straight) return null;
  if (!data) return straight;
  // Keep the moving end glued to the courier's live dot between lookups.
  const glue = (line: Coords[], at: "start" | "end") => {
    if (!courier || line.length < 2) return line;
    return at === "start" ? [courier, ...line.slice(1)] : [...line.slice(0, -1), courier];
  };
  return status === "accepted"
    ? { done: glue(data.done, "start"), left: data.left }
    : { done: glue(data.done, "end"), left: glue(data.left, "start") };
}
