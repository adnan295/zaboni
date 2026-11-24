import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { createCheckoutSender } from "@/lib/checkoutRequest";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

// "scheduled": a meal ordered ahead from the "بيتي وصحّي" section, waiting for its delivery day.
export type OrderStatus = "scheduled" | "searching" | "accepted" | "picked_up" | "on_way" | "delivered" | "cancelled";

export interface OrderItem {
  menuItemId: string | null;
  nameAr: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface PlaceOrderInput {
  items?: { menuItemId: string; qty: number; note?: string | null; selectedOptions?: { optionId: string }[] }[];
  orderText?: string;
  restaurantName: string;
  address: string;
  promoCode?: string;
  lat?: number;
  lon?: number;
  restaurantId?: string;
  usePoints?: boolean;
  flashDealId?: string;
  orderType?: "restaurant" | "errand";
  placeName?: string;
  /** A free order picked from the Homs directory. */
  directoryPlaceId?: string;
  restaurantNote?: string;
}

export interface Order {
  id: string;
  userId: string;
  orderText: string;
  restaurantId?: string | null;
  items?: OrderItem[];
  restaurantName: string;
  status: OrderStatus;
  courierName: string;
  courierPhone: string;
  /** courierPhone is the company line (هاتف الإدارة), not the courier's own number. */
  phoneMasked?: boolean;
  courierRating: number;
  courierId: string;
  createdAt: number;
  address: string;
  estimatedMinutes: number;
  cancelNote?: string | null;
  pointsEarned?: number;
  pointsRedeemed?: number;
  flashDealDiscount?: number;
  deliveryFee?: number | null;
  totalPrice?: number | null;
  orderType?: string;
  placeName?: string | null;
  /** Pre-orders: delivery day (YYYY-MM-DD), window ("13-14") and weekly subscription, if any. */
  scheduledDay?: string | null;
  scheduledWindow?: string | null;
  mealSubscriptionId?: string | null;
  /** Where the order is delivered — the pin the customer chose, not where their phone is now. */
  destinationLat?: number | null;
  destinationLon?: number | null;
}

interface OrderContextValue {
  orders: Order[];
  activeOrder: Order | null;
  placeOrder: (input: PlaceOrderInput) => Promise<Order>;
  getOrder: (id: string) => Order | undefined;
  refreshOrder: (id: string) => Promise<void>;
  /** Reloads the order list, e.g. right after placing pre-orders. */
  refreshOrders: () => Promise<void>;
  setStatusChangeHandler: (handler: (order: Order, newStatus: OrderStatus) => void) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

function apiOrderToLocal(apiOrder: {
  id: string;
  userId?: string;
  orderText: string;
  restaurantId?: string | null;
  items?: OrderItem[] | null;
  restaurantName: string;
  status: string;
  courierName: string;
  courierPhone: string;
  /** courierPhone is the company line (هاتف الإدارة), not the courier's own number. */
  phoneMasked?: boolean;
  courierRating: number;
  courierId: string;
  createdAt: string | Date;
  address: string;
  estimatedMinutes: number;
  cancelNote?: string | null;
  pointsEarned?: number;
  pointsRedeemed?: number;
  flashDealDiscount?: number | null;
  deliveryFee?: number | null;
  totalPrice?: number | null;
  scheduledDay?: string | null;
  scheduledWindow?: string | null;
  mealSubscriptionId?: string | null;
  destinationLat?: number | null;
  destinationLon?: number | null;
}): Order {
  return {
    id: apiOrder.id,
    userId: apiOrder.userId ?? "",
    orderText: apiOrder.orderText,
    restaurantId: apiOrder.restaurantId ?? null,
    items: apiOrder.items ?? [],
    restaurantName: apiOrder.restaurantName,
    status: apiOrder.status as OrderStatus,
    courierName: apiOrder.courierName,
    courierPhone: apiOrder.courierPhone,
    phoneMasked: apiOrder.phoneMasked === true,
    courierRating: apiOrder.courierRating,
    courierId: apiOrder.courierId,
    createdAt:
      apiOrder.createdAt instanceof Date
        ? apiOrder.createdAt.getTime()
        : new Date(apiOrder.createdAt as string).getTime(),
    address: apiOrder.address,
    estimatedMinutes: apiOrder.estimatedMinutes,
    cancelNote: apiOrder.cancelNote ?? null,
    pointsEarned: apiOrder.pointsEarned ?? 0,
    pointsRedeemed: apiOrder.pointsRedeemed ?? 0,
    flashDealDiscount: apiOrder.flashDealDiscount ?? undefined,
    deliveryFee: apiOrder.deliveryFee ?? undefined,
    totalPrice: apiOrder.totalPrice ?? undefined,
    scheduledDay: apiOrder.scheduledDay ? String(apiOrder.scheduledDay).slice(0, 10) : null,
    scheduledWindow: apiOrder.scheduledWindow ?? null,
    mealSubscriptionId: apiOrder.mealSubscriptionId ?? null,
    destinationLat: typeof apiOrder.destinationLat === "number" ? apiOrder.destinationLat : null,
    destinationLon: typeof apiOrder.destinationLon === "number" ? apiOrder.destinationLon : null,
  };
}

const ACTIVE_POLL_MS = 12000;
const IDLE_POLL_MS = 60000;
// A scheduled pre-order is days away: it is neither the "active order" nor a reason to poll fast.
const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled", "scheduled"];

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  const checkoutSender = useRef<ReturnType<typeof createCheckoutSender> | null>(null);
  if (!checkoutSender.current) checkoutSender.current = createCheckoutSender({
    storage: AsyncStorage,
    digest: body => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, body),
    randomKey: () => Crypto.randomUUID(),
    send: (body, key, userId) => {
      if (currentUserId.current !== userId) throw new Error("تغيّر الحساب، يرجى إعادة فتح الطلب");
      return customFetch("/api/orders", { method: "POST", body, headers: { "Idempotency-Key": key } });
    },
  });
  const statusChangeHandler = useRef<((order: Order, newStatus: OrderStatus) => void) | null>(null);
  const prevStatusMapRef = useRef<Record<string, OrderStatus>>({});

  const fetchOrders = useCallback(async () => {
    try {
      const response = await customFetch("/api/orders?limit=50");
      const data = response as { orders?: typeof response; total?: number } | unknown[];
      const fetched = Array.isArray(data) ? data : (data as { orders?: unknown[] }).orders ?? [];
      const mapped = (fetched as Parameters<typeof apiOrderToLocal>[0][]).map(apiOrderToLocal);
      setOrders((prev) => {
        const prevMap = prevStatusMapRef.current;
        const newMap: Record<string, OrderStatus> = {};
        for (const o of mapped) {
          newMap[o.id] = o.status;
          const oldStatus = prevMap[o.id];
          if (oldStatus && oldStatus !== o.status && statusChangeHandler.current) {
            statusChangeHandler.current(o, o.status);
          }
        }
        prevStatusMapRef.current = newMap;
        if (mapped.length === 0 && prev.length === 0) return prev;
        return mapped;
      });
    } catch {
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setOrders([]);
      prevStatusMapRef.current = {};
      return;
    }
    void fetchOrders();
  }, [user?.id, authLoading, fetchOrders]);

  useEffect(() => {
    if (!user || authLoading) return;
    const hasActive = orders.some((o) => !TERMINAL_STATUSES.includes(o.status));
    const interval = setInterval(() => { void fetchOrders(); }, hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(interval);
  }, [user?.id, authLoading, orders, fetchOrders]);

  const setStatusChangeHandler = useCallback(
    (handler: (order: Order, newStatus: OrderStatus) => void) => {
      statusChangeHandler.current = handler;
    },
    []
  );

  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<Order> => {
      const { items, orderText, restaurantName, address, promoCode, lat, lon, restaurantId, usePoints, flashDealId, orderType, placeName, directoryPlaceId, restaurantNote } = input;
      const result = await checkoutSender.current!(user?.id ?? "", JSON.stringify({
          ...(items && items.length > 0 ? { items } : {}),
          ...(orderText ? { orderText } : {}),
          restaurantName,
          address,
          ...(promoCode ? { promoCode } : {}),
          ...(lat != null ? { lat } : {}),
          ...(lon != null ? { lon } : {}),
          ...(restaurantId ? { restaurantId } : {}),
          ...(usePoints ? { usePoints: true } : {}),
          ...(flashDealId ? { flashDealId } : {}),
          ...(orderType ? { orderType } : {}),
          ...(placeName ? { placeName } : {}),
          ...(directoryPlaceId ? { directoryPlaceId } : {}),
          ...(restaurantNote ? { restaurantNote } : {}),
        }));
      if (currentUserId.current !== user?.id) throw new Error("تغيّر الحساب أثناء إرسال الطلب");
      const newOrder = apiOrderToLocal(result as Parameters<typeof apiOrderToLocal>[0]);
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      return newOrder;
    },
    [user?.id]
  );

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders]
  );

  const refreshOrder = useCallback(async (id: string) => {
    try {
      const data = await customFetch(`/api/orders/${id}`);
      const updated = apiOrderToLocal(data as Parameters<typeof apiOrderToLocal>[0]);
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updated.id);
        if (idx === -1) return [updated, ...prev];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    } catch {
    }
  }, []);

  const activeOrder = orders.find((o) => !TERMINAL_STATUSES.includes(o.status)) ?? null;

  return (
    <OrderContext.Provider value={{ orders, activeOrder, placeOrder, getOrder, refreshOrder, refreshOrders: fetchOrders, setStatusChangeHandler }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
}
