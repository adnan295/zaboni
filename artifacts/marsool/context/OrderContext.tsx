import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  createOrder as apiCreateOrder,
  customFetch,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export type OrderStatus = "searching" | "accepted" | "picked_up" | "on_way" | "delivered" | "cancelled";

export interface Order {
  id: string;
  userId: string;
  orderText: string;
  restaurantName: string;
  status: OrderStatus;
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  createdAt: number;
  address: string;
  estimatedMinutes: number;
  cancelNote?: string | null;
}

interface OrderContextValue {
  orders: Order[];
  activeOrder: Order | null;
  placeOrder: (orderText: string, restaurantName: string, address: string, promoCode?: string, lat?: number, lon?: number, restaurantId?: string) => Promise<Order>;
  getOrder: (id: string) => Order | undefined;
  refreshOrder: (id: string) => Promise<void>;
  setStatusChangeHandler: (handler: (order: Order, newStatus: OrderStatus) => void) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

function apiOrderToLocal(apiOrder: {
  id: string;
  userId?: string;
  orderText: string;
  restaurantName: string;
  status: string;
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  createdAt: string | Date;
  address: string;
  estimatedMinutes: number;
  cancelNote?: string | null;
}): Order {
  return {
    id: apiOrder.id,
    userId: apiOrder.userId ?? "",
    orderText: apiOrder.orderText,
    restaurantName: apiOrder.restaurantName,
    status: apiOrder.status as OrderStatus,
    courierName: apiOrder.courierName,
    courierPhone: apiOrder.courierPhone,
    courierRating: apiOrder.courierRating,
    courierId: apiOrder.courierId,
    createdAt:
      apiOrder.createdAt instanceof Date
        ? apiOrder.createdAt.getTime()
        : new Date(apiOrder.createdAt as string).getTime(),
    address: apiOrder.address,
    estimatedMinutes: apiOrder.estimatedMinutes,
    cancelNote: apiOrder.cancelNote ?? null,
  };
}

const ACTIVE_POLL_MS = 12000;
const IDLE_POLL_MS = 60000;
const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
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
    async (orderText: string, restaurantName: string, address: string, promoCode?: string, lat?: number, lon?: number, restaurantId?: string): Promise<Order> => {
      const result = await apiCreateOrder({
          orderText,
          restaurantName,
          address,
          ...(promoCode ? { promoCode } : {}),
          ...(lat != null ? { lat } : {}),
          ...(lon != null ? { lon } : {}),
          ...(restaurantId ? { restaurantId } : {}),
        });
      const newOrder = apiOrderToLocal(result);
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      return newOrder;
    },
    []
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

  const activeOrder = orders.find((o) => o.status !== "delivered" && o.status !== "cancelled") ?? null;

  return (
    <OrderContext.Provider value={{ orders, activeOrder, placeOrder, getOrder, refreshOrder, setStatusChangeHandler }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
}
