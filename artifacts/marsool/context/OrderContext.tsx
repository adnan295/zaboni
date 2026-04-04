import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { Platform } from "react-native";
import { io, Socket } from "socket.io-client";
import {
  createOrder as apiCreateOrder,
  updateOrderStatus,
  getOrders as apiFetchOrders,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/apiConfig";

export type OrderStatus = "searching" | "accepted" | "picked_up" | "on_way" | "delivered";

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

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const statusChangeHandler = useRef<((order: Order, newStatus: OrderStatus) => void) | null>(null);
  const socketRef = useRef<Socket | null>(null);

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

  useEffect(() => {
    if (!user || !token || authLoading) return;

    const baseUrl = Platform.OS === "web" ? undefined : getApiBaseUrl();
    const socketUrl = baseUrl ? `${baseUrl}/orders` : "/orders";

    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("order_updated", (updatedOrder: Parameters<typeof apiOrderToLocal>[0]) => {
      const local = apiOrderToLocal(updatedOrder);
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === local.id);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = local;
        if (statusChangeHandler.current) {
          statusChangeHandler.current(local, local.status);
        }
        return updated;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, token, authLoading]);

  const setStatusChangeHandler = useCallback(
    (handler: (order: Order, newStatus: OrderStatus) => void) => {
      statusChangeHandler.current = handler;
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
        newOrder = {
          id,
          orderText,
          restaurantName,
          status: "searching",
          courierName: "",
          courierPhone: "",
          courierRating: 0,
          courierId: "",
          createdAt: Date.now(),
          address,
          estimatedMinutes: 30,
        };
      }
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
