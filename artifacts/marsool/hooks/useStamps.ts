import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { getApiBaseUrl } from "@/lib/apiConfig";

export interface StampCoupon {
  id: string;
  restaurantId: string;
  restaurantName: string;
  label: string;
  rewardType: "amount" | "item";
  rewardAmount: number;
  rewardItemId: string | null;
  expiresAt: string;
}

export interface RestaurantStampCard {
  goal: number;
  minOrder: number;
  reward: string;
  stamps: number;
  coupon: StampCoupon | null;
}

export interface MyStampCard {
  restaurantId: string;
  restaurantName: string;
  stamps: number;
  goal: number;
  minOrder: number;
  reward: string;
  lastStampAt: string | null;
}

/** Restaurants running «اطلب واربح» (public), for the small badge on their cards. */
export function useStampRestaurants(): Set<string> {
  const { data } = useQuery({
    queryKey: ["stamps", "programs"],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/stamps/programs`);
      if (!res.ok) return [] as string[];
      const body = (await res.json()) as { programs?: { restaurantId: string }[] };
      return (body.programs ?? []).map((p) => p.restaurantId);
    },
    staleTime: 5 * 60_000,
  });
  return new Set(data ?? []);
}

/** This restaurant's terms and the customer's card there; null when it does not run «اطلب واربح». */
export function useRestaurantStamps(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["stamps", "restaurant", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => (await customFetch<{ card: RestaurantStampCard | null }>(`/api/stamps/restaurants/${restaurantId}`)).card,
    staleTime: 60_000,
  });
}

/** «أختامي». */
export function useMyStamps() {
  return useQuery({
    queryKey: ["stamps", "me"],
    queryFn: () => customFetch<{ cards: MyStampCard[]; coupons: StampCoupon[] }>("/api/stamps/me"),
    staleTime: 30_000,
  });
}

/** The coupon «راجع طلبك» offers for this restaurant. */
export function useCheckoutCoupon(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["stamps", "checkout", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => (await customFetch<{ coupon: StampCoupon | null }>(`/api/stamps/checkout?restaurantId=${encodeURIComponent(restaurantId!)}`)).coupon,
    staleTime: 15_000,
  });
}
