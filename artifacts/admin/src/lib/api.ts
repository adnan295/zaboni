const API_BASE = "/api";

export function getAdminToken(): string | null {
  return localStorage.getItem("marsool_admin_token");
}

export function setAdminToken(token: string): void {
  localStorage.setItem("marsool_admin_token", token);
}

export function clearAdminToken(): void {
  localStorage.removeItem("marsool_admin_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAdminToken();
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

export type Stats = {
  restaurants: number;
  orders: number;
  todayOrders: number;
  users: number;
  couriers: number;
  menuItems: number;
  ordersByStatus: Array<{ status: string; count: number }>;
  recentOrders: (Order & { customerName: string | null })[];
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
  image: string;
  tags: string[];
  isOpen: boolean;
  discount: string | null;
};

export type MenuItem = {
  id: string;
  restaurantId: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  image: string;
  category: string;
  categoryAr: string;
  isPopular: boolean;
};

export type Order = {
  id: string;
  userId: string;
  orderText: string;
  restaurantName: string;
  status: string;
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  address: string;
  paymentMethod: string;
  estimatedMinutes: number;
  createdAt: string;
  updatedAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
};

export type OrdersPage = {
  data: Order[];
  total: number;
  page: number;
  limit: number;
};

export type User = {
  id: string;
  phone: string;
  name: string;
  role: "customer" | "courier";
  createdAt: string;
};

export const api = {
  async verifyToken(token: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  },

  getStats: () => apiFetch<Stats>("/admin/stats"),
  getRestaurants: () => apiFetch<Restaurant[]>("/admin/restaurants"),
  createRestaurant: (data: Partial<Restaurant>) =>
    apiFetch<Restaurant>("/admin/restaurants", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateRestaurant: (id: string, data: Partial<Restaurant>) =>
    apiFetch<Restaurant>(`/admin/restaurants/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteRestaurant: (id: string) =>
    apiFetch<void>(`/admin/restaurants/${id}`, { method: "DELETE" }),

  getMenu: (restaurantId: string) =>
    apiFetch<MenuItem[]>(`/admin/restaurants/${restaurantId}/menu`),
  createMenuItem: (restaurantId: string, data: Partial<MenuItem>) =>
    apiFetch<MenuItem>(`/admin/restaurants/${restaurantId}/menu`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateMenuItem: (restaurantId: string, itemId: string, data: Partial<MenuItem>) =>
    apiFetch<MenuItem>(`/admin/restaurants/${restaurantId}/menu/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteMenuItem: (restaurantId: string, itemId: string) =>
    apiFetch<void>(`/admin/restaurants/${restaurantId}/menu/${itemId}`, {
      method: "DELETE",
    }),

  getOrders: (page = 1, limit = 50) =>
    apiFetch<OrdersPage>(`/admin/orders?page=${page}&limit=${limit}`),
  getUsers: () => apiFetch<User[]>("/admin/users"),
  updateUserRole: (id: string, role: "customer" | "courier") =>
    apiFetch<User>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
};
