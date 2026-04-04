import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

export function RatingsProvider({ children }: { children: React.ReactNode }) {
  const [ratings, setRatings] = useState<Rating[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const migrated = parsed.map((r: Rating & { stars?: number }) => {
        if (r.restaurantStars === undefined || r.courierStars === undefined) {
          const fallback = r.stars ?? 3;
          return { ...r, restaurantStars: fallback, courierStars: fallback };
        }
        return r;
      });
      setRatings(migrated);
    });
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
      setRatings((prev) => {
        const next = [entry, ...prev.filter((r) => r.orderId !== orderId)];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    <RatingsContext.Provider value={{ ratings, rateOrder, getRating, hasRated }}>
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error("useRatings must be used within RatingsProvider");
  return ctx;
}
