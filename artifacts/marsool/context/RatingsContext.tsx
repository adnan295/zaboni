import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";

const STORAGE_KEY = "@marsool_ratings";

export interface Rating {
  orderId: string;
  restaurantStars: number;
  courierStars: number;
  comment: string;
  restaurantName: string;
  createdAt: number;
}

interface RatingsContextValue {
  ratings: Rating[];
  ratingsLoaded: boolean;
  rateOrder: (
    orderId: string,
    restaurantStars: number,
    courierStars: number,
    comment: string,
    restaurantName: string
  ) => Promise<void>;
  getRating: (orderId: string) => Rating | undefined;
  hasRated: (orderId: string) => boolean;
}

const RatingsContext = createContext<RatingsContextValue | null>(null);

function normalizeApiRatings(raw: Array<Record<string, unknown>>): Rating[] {
  return raw.map((r) => ({
    orderId: String(r["orderId"] ?? r["order_id"] ?? ""),
    restaurantStars: Number(r["restaurantStars"] ?? r["restaurant_stars"] ?? 0),
    courierStars: Number(r["courierStars"] ?? r["courier_stars"] ?? 0),
    comment: String(r["comment"] ?? ""),
    restaurantName: String(r["restaurantName"] ?? r["restaurant_name"] ?? ""),
    createdAt: r["createdAt"]
      ? new Date(String(r["createdAt"])).getTime()
      : Date.now(),
  }));
}

export function RatingsProvider({ children }: { children: React.ReactNode }) {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [ratingsLoaded, setRatingsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const localRaw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      let local: Rating[] = [];
      if (localRaw) {
        try {
          const parsed = JSON.parse(localRaw);
          local = parsed.map((r: Rating & { stars?: number }) => ({
            ...r,
            restaurantStars: r.restaurantStars ?? r.stars ?? 3,
            courierStars: r.courierStars ?? r.stars ?? 3,
          }));
        } catch {}
      }

      if (!cancelled) {
        setRatings(local);
        setRatingsLoaded(true);
      }

      try {
        const remote = await customFetch<Array<Record<string, unknown>>>("/api/orders/ratings");
        if (!cancelled && Array.isArray(remote)) {
          const normalized = normalizeApiRatings(remote);
          const localIds = new Set(local.map((r) => r.orderId));
          const merged: Rating[] = [...local];
          for (const r of normalized) {
            if (!localIds.has(r.orderId)) {
              merged.push(r);
            }
          }
          merged.sort((a, b) => b.createdAt - a.createdAt);
          if (!cancelled) {
            setRatings(merged);
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
          }
        }
      } catch {}
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rateOrder = useCallback(
    async (
      orderId: string,
      restaurantStars: number,
      courierStars: number,
      comment: string,
      restaurantName: string
    ) => {
      const entry: Rating = {
        orderId,
        restaurantStars,
        courierStars,
        comment,
        restaurantName,
        createdAt: Date.now(),
      };

      try {
        await customFetch(`/api/orders/${orderId}/rate`, {
          method: "POST",
          body: JSON.stringify({ restaurantStars, courierStars, comment, restaurantName }),
        });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status !== 409) {
          throw err;
        }
      }

      setRatings((prev) => {
        const next = [entry, ...prev.filter((r) => r.orderId !== orderId)];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const getRating = useCallback(
    (orderId: string) => ratings.find((r) => r.orderId === orderId),
    [ratings]
  );
  const hasRated = useCallback(
    (orderId: string) => ratings.some((r) => r.orderId === orderId),
    [ratings]
  );

  return (
    <RatingsContext.Provider value={{ ratings, ratingsLoaded, rateOrder, getRating, hasRated }}>
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error("useRatings must be used within RatingsProvider");
  return ctx;
}
