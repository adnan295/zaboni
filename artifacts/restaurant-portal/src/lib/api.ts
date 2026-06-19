const API_BASE = "/api";

const TOKEN_KEY = "restaurant_portal_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export type AuthInfo = {
  token: string;
  restaurant: { id: string; name: string; nameAr: string; image: string | null };
  authMode: "password" | "otp";
};

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (data: { phone: string; password: string }) =>
    apiFetch<AuthInfo>("/restaurant-portal/auth/login", { method: "POST", body: JSON.stringify(data) }),

  requestOtp: (phone: string) =>
    apiFetch<{ ok: boolean; devCode?: string }>("/restaurant-portal/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) }),

  verifyOtp: (data: { phone: string; code: string }) =>
    apiFetch<AuthInfo>("/restaurant-portal/auth/verify-otp", { method: "POST", body: JSON.stringify(data) }),

  getMe: () => apiFetch<Restaurant>("/restaurant-portal/me"),

  updateRestaurant: (data: Partial<Restaurant>) =>
    apiFetch<Restaurant>("/restaurant-portal/restaurant", { method: "PUT", body: JSON.stringify(data) }),

  getMenu: () => apiFetch<MenuItem[]>("/restaurant-portal/menu"),

  createMenuItem: (data: Omit<MenuItem, "id" | "restaurantId">) =>
    apiFetch<MenuItem>("/restaurant-portal/menu", { method: "POST", body: JSON.stringify(data) }),

  updateMenuItem: (id: string, data: Partial<MenuItem>) =>
    apiFetch<MenuItem>(`/restaurant-portal/menu/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteMenuItem: (id: string) =>
    apiFetch<void>(`/restaurant-portal/menu/${id}`, { method: "DELETE" }),

  updateItemAvailability: (id: string, isAvailable: boolean) =>
    apiFetch<MenuItem>(`/restaurant-portal/menu/${id}/availability`, { method: "PATCH", body: JSON.stringify({ isAvailable }) }),

  getHours: () => apiFetch<RestaurantHour[]>("/restaurant-portal/hours"),

  updateHours: (hours: RestaurantHour[]) =>
    apiFetch<RestaurantHour[]>("/restaurant-portal/hours", { method: "PUT", body: JSON.stringify({ hours }) }),

  getOrders: () => apiFetch<Order[]>("/restaurant-portal/orders?limit=50"),

  getStats: () => apiFetch<Stats>("/restaurant-portal/stats"),

  getAnalytics: () => apiFetch<Analytics>("/restaurant-portal/analytics"),

  getRatings: () => apiFetch<RatingsData>("/restaurant-portal/ratings"),

  getPromoTemplates: () => apiFetch<PromoTemplate[]>("/restaurant-portal/promo-templates"),

  generatePromoImage: (data: { foodObjectPath?: string; oldPrice: string; newPrice: string; tagline?: string; couponCode?: string; templateId: string }) =>
    apiFetch<GeneratePromoResult>("/restaurant-portal/promo-images/generate", { method: "POST", body: JSON.stringify(data) }),

  getPromoImages: () => apiFetch<PromoImage[]>("/restaurant-portal/promo-images"),

  getPromos: () => apiFetch<RestaurantPromo[]>("/restaurant-portal/promos"),

  createPromo: (data: {
    code: string;
    type: "percent" | "fixed";
    value: number;
    maxUses?: number | null;
    maxUsesPerUser?: number;
    expiresAt?: string | null;
    isActive?: boolean;
  }) => apiFetch<RestaurantPromo>("/restaurant-portal/promos", { method: "POST", body: JSON.stringify(data) }),

  updatePromo: (id: string, data: Partial<{
    code: string;
    type: "percent" | "fixed";
    value: number;
    maxUses: number | null;
    maxUsesPerUser: number;
    expiresAt: string | null;
    isActive: boolean;
  }>) => apiFetch<RestaurantPromo>(`/restaurant-portal/promos/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deletePromo: (id: string) => apiFetch<void>(`/restaurant-portal/promos/${id}`, { method: "DELETE" }),
};

export type Restaurant = {
  id: string;
  name: string;
  nameAr: string;
  category: string;
  categoryAr: string;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  deliveryFee: number;
  minOrder: number;
  image: string | null;
  tags: string[];
  isOpen: boolean;
  discount: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  nameAr: string;
  description: string | null;
  descriptionAr: string | null;
  price: number;
  image: string;
  category: string;
  categoryAr: string;
  subcategory: string | null;
  subcategoryAr: string | null;
  isPopular: boolean;
  isAvailable: boolean;
};

export type RestaurantHour = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

export type Order = {
  id: string;
  userId: string;
  orderText: string;
  restaurantName: string;
  status: string;
  courierName: string | null;
  courierPhone: string | null;
  address: string | null;
  estimatedMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  deliveryFee: number | null;
  totalAmount: number | null;
};

export type PromoTemplate = {
  id: string;
  nameAr: string;
  description: string;
  emoji: string;
  layoutGroup: string;
  previewUrl: string;
};

export type GeneratePromoResult = {
  id: string;
  resultUrl: string;
  restaurantName: string;
  oldPrice: string;
  newPrice: string;
  tagline?: string;
  templateId: string;
  templateName: string;
};

export type PromoImage = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  foodImageUrl: string | null;
  oldPrice: string;
  newPrice: string;
  tagline: string | null;
  resultUrl: string;
  templateId: string;
  createdAt: string;
};

export type Stats = {
  totalOrders: number;
  todayOrders: number;
  todayDelivered: number;
  menuItemCount: number;
  rating: number;
  isOpen: boolean;
};

export type RatingsData = {
  avgStars: number;
  totalCount: number;
  distribution: { stars: number; count: number; pct: number }[];
  ratings: { id: string; restaurantStars: number; comment: string; createdAt: string }[];
};

export type RestaurantPromo = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  maxUses: number | null;
  maxUsesPerUser: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  usedCount: number;
};

export type Analytics = {
  todayOrders: number;
  todayRevenue: number;
  todayDeliveryRevenue: number;
  weekOrders: number;
  weekRevenue: number;
  weekDeliveryRevenue: number;
  dailySeries: { date: string; orders: number; revenue: number }[];
  topItems: { name: string; count: number }[];
  peakHours: { hour: number; count: number }[];
};
