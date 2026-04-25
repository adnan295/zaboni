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
  yesterdayOrders: number;
  users: number;
  couriers: number;
  menuItems: number;
  ordersByStatus: Array<{ status: string; count: number }>;
  recentOrders: (Order & { customerName: string | null })[];
};

export type DailyChart = { date: string; count: number };
export type HourlyChart = { hour: number; count: number };

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
  isLogo: boolean;
  discount: string | null;
  lat?: number | null;
  lon?: number | null;
  phone?: string | null;
  ordersCount?: number;
  avgCourierRating?: number | null;
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
  avatarUrl?: string | null;
  createdAt: string;
};

export type Courier = {
  id: string;
  name: string;
  phone: string;
  avatarUrl?: string | null;
  createdAt: string;
  deliveredCount: number;
  totalAssigned: number;
  avgRating: number | null;
  lastDelivery: string | null;
};

export type ChatSummary = {
  orderId: string;
  orderText: string;
  status: string;
  orderCreatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  courierName: string | null;
  courierPhone: string | null;
  messageCount: number;
  lastMessageAt: string;
  lastMessageText: string | null;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderRole: "customer" | "courier";
  text: string;
  createdAt: string;
};

export type ChatThread = {
  order: {
    id: string;
    orderText: string;
    status: string;
    createdAt: string;
  };
  messages: ChatMessage[];
};

export type ActiveOrderLocation = {
  id: string;
  status: string;
  orderText: string;
  restaurantName: string;
  address: string;
  destinationLat: number | null;
  destinationLon: number | null;
  updatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  courierName: string | null;
  courierPhone: string | null;
  restaurantLat: number | null;
  restaurantLon: number | null;
};

export type CourierLocation = {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  lat: number;
  lon: number;
  locationUpdatedAt: string | null;
  todayDeliveries: number;
  currentOrder: {
    id: string;
    status: string;
    orderText: string;
    restaurantName: string;
    address: string;
    customerName: string | null;
  } | null;
};

export type Rating = {
  id: string;
  orderId: string;
  userId: string;
  courierId: string;
  restaurantId: string | null;
  restaurantStars: number;
  courierStars: number;
  comment: string;
  restaurantName: string;
  createdAt: string;
  userName: string | null;
  userPhone: string | null;
  courierName: string | null;
  courierPhone: string | null;
};

export type RatingsPage = {
  ratings: Rating[];
  total: number;
  avgRestaurantStars: number | null;
  avgCourierStars: number | null;
};

export type RestaurantHour = {
  id: string;
  restaurantId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

export type NotificationLog = {
  id: string;
  title: string;
  body: string;
  target: "all" | "customers" | "couriers" | "targeted";
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

export type SendToUserResult = {
  success: boolean;
  sentCount: number;
  failedCount: number;
  userId: string;
  userName: string;
};

export type UserLookupResult = {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "courier";
  hasPushToken: boolean;
}[];

export type BroadcastResult = {
  success: boolean;
  sentCount: number;
  failedCount: number;
  total: number;
};

export type FinancialReport = {
  summary: {
    totalOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    totalDeliveryFees: number;
    subscriptionRevenue: number;
    paidSubscriptions: number;
    waivedSubscriptions: number;
    pendingSubscriptions: number;
  };
  byRestaurant: {
    restaurantName: string;
    totalOrders: number;
    deliveredOrders: number;
    revenue: number;
  }[];
  revenueSeries: {
    date: string;
    revenue: number;
    orders: number;
  }[];
  groupBy: "day" | "week";
  days: number;
};

export type DeliveryZone = {
  id: string;
  label: string | null;
  fromKm: number;
  toKm: number;
  fee: number;
  isActive: boolean;
  createdAt: string;
};

export type PromoBanner = {
  id: string;
  image: string;
  restaurantId: string | null;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  iconName: string;
  bgColor: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RestaurantCategory = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  iconName: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PromoCode = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  maxUses: number | null;
  maxUsesPerUser: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  usesCount?: number;
};

export const ORDER_STATUSES = [
  "searching",
  "accepted",
  "picked_up",
  "on_way",
  "delivered",
  "cancelled",
] as const;

export type CourierSubscriptionRow = {
  courierId: string;
  name: string;
  phone: string;
  date: string;
  subscriptionId: string | null;
  status: "paid" | "waived" | "pending";
  amount: number;
  note: string | null;
};

export type SubscriptionDay = {
  date: string;
  defaultFee: number;
  couriers: CourierSubscriptionRow[];
};

export type SubscriptionReport = {
  month: string;
  totalPaid: number;
  totalWaived: number;
  totalRevenue: number;
  totalWaivedAmount: number;
  entries: {
    id: string;
    courierId: string;
    date: string;
    amount: number;
    status: "paid" | "waived" | "pending";
    note: string | null;
    createdAt: string;
  }[];
};

export type SystemSettings = Record<string, string>;

export type WalletDepositRequest = {
  id: string;
  courierId: string;
  courierName: string;
  courierPhone: string;
  walletBalance: number;
  amount: number;
  type: string;
  status: string;
  note: string | null;
  createdAt: string;
};

export type CourierApplicationItem = {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  fullName: string;
  vehicleType: "motorcycle" | "car" | "bicycle";
  vehiclePlate: string;
  idNumber: string;
  notes: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  phone: string | null;
  userName: string | null;
};

export const api = {
  async verifyToken(token: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  },

  getStats: () => apiFetch<Stats>("/admin/stats"),
  getDailyChart: (days?: number) =>
    apiFetch<DailyChart[]>(`/admin/charts/daily${days ? `?days=${days}` : ""}`),
  getHourlyChart: () => apiFetch<HourlyChart[]>("/admin/charts/hourly"),

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

  getOrders: (page = 1, limit = 50, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return apiFetch<OrdersPage>(`/admin/orders?${params.toString()}`);
  },
  getActiveOrders: () => apiFetch<Order[]>("/admin/orders/active"),
  updateOrderStatus: (id: string, status: string) =>
    apiFetch<Order>(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getCouriers: () => apiFetch<Courier[]>("/admin/couriers"),
  getCourierLocations: () => apiFetch<CourierLocation[]>("/admin/couriers/locations"),
  getActiveOrderLocations: () => apiFetch<ActiveOrderLocation[]>("/admin/orders/active/locations"),

  getChats: (q?: string) => apiFetch<ChatSummary[]>(`/admin/chats${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getChatThread: (orderId: string) => apiFetch<ChatThread>(`/admin/chats/${orderId}`),

  getUsers: () => apiFetch<User[]>("/admin/users"),
  updateUserRole: (id: string, role: "customer" | "courier") =>
    apiFetch<User>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),

  getRatings: (limit = 50, offset = 0) =>
    apiFetch<RatingsPage>(`/admin/ratings?limit=${limit}&offset=${offset}`),

  getPromos: () => apiFetch<PromoCode[]>("/admin/promos"),
  createPromo: (data: Partial<PromoCode> & { code: string; type: "percent" | "fixed"; value: number }) =>
    apiFetch<PromoCode>("/admin/promos", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePromo: (id: string, data: Partial<PromoCode>) =>
    apiFetch<PromoCode>(`/admin/promos/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deletePromo: (id: string) =>
    apiFetch<void>(`/admin/promos/${id}`, { method: "DELETE" }),

  getRestaurantHours: (restaurantId: string) =>
    apiFetch<RestaurantHour[]>(`/admin/restaurants/${restaurantId}/hours`),
  updateRestaurantHours: (restaurantId: string, hours: Omit<RestaurantHour, "id" | "restaurantId">[]) =>
    apiFetch<RestaurantHour[]>(`/admin/restaurants/${restaurantId}/hours`, {
      method: "PUT",
      body: JSON.stringify(hours),
    }),

  broadcastNotification: (data: { title: string; body: string; target: "all" | "customers" | "couriers" }) =>
    apiFetch<BroadcastResult>("/admin/notifications/broadcast", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  lookupUser: (q: string) =>
    apiFetch<UserLookupResult>(`/admin/notifications/lookup-user?q=${encodeURIComponent(q)}`),
  sendNotificationToUser: (data: { phone: string; title: string; body: string }) =>
    apiFetch<SendToUserResult>("/admin/notifications/send-to-user", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getNotificationHistory: () =>
    apiFetch<NotificationLog[]>("/admin/notifications/history"),

  getDeliveryZones: () => apiFetch<DeliveryZone[]>("/admin/delivery-zones"),
  createDeliveryZone: (data: Omit<DeliveryZone, "id" | "createdAt">) =>
    apiFetch<DeliveryZone>("/admin/delivery-zones", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateDeliveryZone: (id: string, data: Partial<Omit<DeliveryZone, "id" | "createdAt">>) =>
    apiFetch<DeliveryZone>(`/admin/delivery-zones/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteDeliveryZone: (id: string) =>
    apiFetch<void>(`/admin/delivery-zones/${id}`, { method: "DELETE" }),

  getBanners: () => apiFetch<PromoBanner[]>("/admin/banners"),
  createBanner: (data: Omit<PromoBanner, "id" | "createdAt" | "updatedAt">) =>
    apiFetch<PromoBanner>("/admin/banners", { method: "POST", body: JSON.stringify(data) }),
  updateBanner: (id: string, data: Partial<Omit<PromoBanner, "id" | "createdAt" | "updatedAt">>) =>
    apiFetch<PromoBanner>(`/admin/banners/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBanner: (id: string) =>
    apiFetch<void>(`/admin/banners/${id}`, { method: "DELETE" }),

  getAdminCategories: () => apiFetch<RestaurantCategory[]>("/admin/categories"),
  createCategory: (data: Omit<RestaurantCategory, "id" | "createdAt" | "updatedAt">) =>
    apiFetch<RestaurantCategory>("/admin/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<Omit<RestaurantCategory, "id" | "createdAt" | "updatedAt">>) =>
    apiFetch<RestaurantCategory>(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    apiFetch<void>(`/admin/categories/${id}`, { method: "DELETE" }),

  getFinancialReport: (days?: number, groupBy?: 'day' | 'week') => {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (groupBy) params.set('groupBy', groupBy);
    const qs = params.toString();
    return apiFetch<FinancialReport>(`/admin/financial${qs ? `?${qs}` : ''}`);
  },

  getSettings: () => apiFetch<SystemSettings>("/admin/settings"),
  updateSettings: (data: Record<string, string>) =>
    apiFetch<{ ok: boolean }>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getSmsStatus: () =>
    apiFetch<{ jwtConfigured: boolean; smsConfigured: boolean; smsMethod: string; smsUrl: string | null }>("/admin/sms/status"),
  testSms: (phone: string) =>
    apiFetch<{ ok: boolean; message: string }>("/admin/sms/test", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  testWebhook: (url: string) =>
    apiFetch<{ ok: boolean; message: string }>("/admin/webhook/test", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  getSubscriptions: (date?: string) => {
    const qs = date ? `?date=${date}` : "";
    return apiFetch<SubscriptionDay>(`/admin/subscriptions${qs}`);
  },
  saveSubscription: (data: {
    courierId: string;
    date: string;
    status: "paid" | "waived" | "pending";
    amount: number;
    note: string | null;
  }) =>
    apiFetch<CourierSubscriptionRow>("/admin/subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getCourierSubscriptionHistory: (courierId: string) =>
    apiFetch<SubscriptionReport["entries"]>(`/admin/subscriptions/history/${courierId}`),
  getSubscriptionReport: (month?: string) => {
    const qs = month ? `?month=${month}` : "";
    return apiFetch<SubscriptionReport>(`/admin/subscriptions/report${qs}`);
  },

  getWalletDepositRequests: () =>
    apiFetch<WalletDepositRequest[]>("/admin/wallet/deposit-requests"),
  approveDepositRequest: (id: string) =>
    apiFetch<{ ok: boolean; newBalance: number }>(`/admin/wallet/deposit-requests/${id}/approve`, {
      method: "POST",
    }),
  rejectDepositRequest: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/wallet/deposit-requests/${id}/reject`, {
      method: "POST",
    }),

  getCourierApplications: () =>
    apiFetch<CourierApplicationItem[]>("/admin/courier-applications"),
  approveCourierApplication: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/courier-applications/${id}/approve`, {
      method: "PATCH",
    }),
  rejectCourierApplication: (id: string, adminNote: string) =>
    apiFetch<{ ok: boolean }>(`/admin/courier-applications/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ adminNote }),
    }),

  getWaVerifyHealth: async (): Promise<WaVerifyHealth> => {
    const token = getAdminToken();
    const res = await fetch(`${API_BASE}/auth/waverify-health`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const body = await res.json().catch(() => ({ ok: false }));
    return body as WaVerifyHealth;
  },

  getWaVerifyHealthHistory: async (limit = 20): Promise<WaVerifyHealthLogEntry[]> => {
    const token = getAdminToken();
    const res = await fetch(`${API_BASE}/auth/waverify-health/history?limit=${limit}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => []);
    return body as WaVerifyHealthLogEntry[];
  },

  getWhatsAppAccounts: () => apiFetch<WAAccount[]>("/admin/whatsapp/accounts"),
  addWhatsAppAccount: () =>
    apiFetch<{ id: string }>("/admin/whatsapp/accounts", { method: "POST" }),
  disconnectWhatsAppAccount: (id: string) =>
    apiFetch<void>(`/admin/whatsapp/accounts/${id}`, { method: "DELETE" }),
};

export type WAAccount = {
  id: string;
  status: "connecting" | "qr" | "connected" | "disconnected";
  qrDataUrl?: string;
  phone?: string;
  createdAt: string;
};

export type WaVerifyHealth = {
  ok: boolean;
  configured?: boolean;
  message?: string;
  error?: string;
};

export type WaVerifyHealthLogEntry = {
  id: number;
  ok: boolean;
  httpStatus: number | null;
  message: string | null;
  checkedAt: string;
};
