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
  updateOrderStatus,
  getOrders as apiFetchOrders,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export type OrderStatus = "searching" | "accepted" | "on_way" | "delivered";

export interface Order {
  id: string;
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
}

interface OrderContextValue {
  orders: Order[];
  activeOrder: Order | null;
  placeOrder: (orderText: string, restaurantName: string, address: string) => Promise<Order>;
  getOrder: (id: string) => Order | undefined;
  setStatusChangeHandler: (handler: (order: Order, newStatus: OrderStatus) => void) => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

function apiOrderToLocal(apiOrder: {
  id: string;
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
}): Order {
  return {
    id: apiOrder.id,
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
  };
}

const FALLBACK_COURIERS = [
  { id: "c1", name: "أحمد الزهراني", phone: "+966 50 123 4567", rating: 4.9 },
  { id: "c2", name: "علي المطيري", phone: "+966 55 234 5678", rating: 4.8 },
];

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const statusChangeHandler = useRef<((order: Order, newStatus: OrderStatus) => void) | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setOrders([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const fetched = await apiFetchOrders({});
        if (!cancelled && fetched && fetched.length > 0) {
          setOrders(fetched.map(apiOrderToLocal));
        }
      } catch {
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, authLoading]);

  const setStatusChangeHandler = useCallback(
    (handler: (order: Order, newStatus: OrderStatus) => void) => {
      statusChangeHandler.current = handler;
    },
    []
  );

  const advanceStatus = useCallback(
    async (orderId: string, newStatus: OrderStatus) => {
      try {
        const updated = await updateOrderStatus(orderId, { status: newStatus });
        const localOrder = apiOrderToLocal(updated);
        setOrders((prev) => {
          if (statusChangeHandler.current) {
            statusChangeHandler.current(localOrder, newStatus);
          }
          return prev.map((o) => (o.id === orderId ? localOrder : o));
        });
      } catch {
        setOrders((prev) => {
          const order = prev.find((o) => o.id === orderId);
          if (!order) return prev;
          const updated = { ...order, status: newStatus };
          if (statusChangeHandler.current) {
            statusChangeHandler.current(updated, newStatus);
          }
          return prev.map((o) => (o.id === orderId ? updated : o));
        });
      }
    },
    []
  );

  const placeOrder = useCallback(
    async (orderText: string, restaurantName: string, address: string): Promise<Order> => {
      let newOrder: Order;
      try {
        const result = await apiCreateOrder({
          orderText,
          restaurantName,
          address,
        });
        newOrder = apiOrderToLocal(result);
      } catch {
        const id = `${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
        const courier = FALLBACK_COURIERS[Math.floor(Math.random() * FALLBACK_COURIERS.length)];
        newOrder = {
          id,
          orderText,
          restaurantName,
          status: "searching",
          courierName: courier.name,
          courierPhone: courier.phone,
          courierRating: courier.rating,
          courierId: courier.id,
          createdAt: Date.now(),
          address,
          estimatedMinutes: Math.floor(Math.random() * 15) + 20,
        };
      }
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });

      const searchDelay = Math.floor(Math.random() * 3000) + 4000;
      setTimeout(() => advanceStatus(newOrder.id, "accepted"), searchDelay);
      setTimeout(() => advanceStatus(newOrder.id, "on_way"), searchDelay + 90000);
      setTimeout(() => advanceStatus(newOrder.id, "delivered"), searchDelay + 90000 + 300000);

      return newOrder;
    },
    [advanceStatus]
  );

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders]
  );

  const activeOrder = orders.find((o) => o.status !== "delivered") ?? null;

  return (
    <OrderContext.Provider value={{ orders, activeOrder, placeOrder, getOrder, setStatusChangeHandler }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
}
