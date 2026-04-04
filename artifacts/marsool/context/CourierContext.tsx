import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export interface CourierOrder {
  id: string;
  userId: string;
  orderText: string;
  restaurantName: string;
  status: "searching" | "accepted" | "on_way" | "delivered";
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  address: string;
  estimatedMinutes: number;
  createdAt: string;
}

interface CourierContextValue {
  availableOrders: CourierOrder[];
  activeOrders: CourierOrder[];
  isLoadingAvailable: boolean;
  isLoadingActive: boolean;
  refreshAvailableOrders: () => Promise<void>;
  refreshActiveOrders: () => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  updateDeliveryStatus: (orderId: string, status: "on_way" | "delivered") => Promise<void>;
}

const CourierContext = createContext<CourierContextValue | null>(null);

export function CourierProvider({ children }: { children: React.ReactNode }) {
  const { user, isCourier } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<CourierOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<CourierOrder[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isLoadingActive, setIsLoadingActive] = useState(false);

  const refreshAvailableOrders = useCallback(async () => {
    if (!user || !isCourier) return;
    setIsLoadingAvailable(true);
    try {
      const data = await customFetch<CourierOrder[]>("/api/courier/orders/available");
      setAvailableOrders(Array.isArray(data) ? data : []);
    } catch {
      setAvailableOrders([]);
    } finally {
      setIsLoadingAvailable(false);
    }
  }, [user, isCourier]);

  const refreshActiveOrders = useCallback(async () => {
    if (!user || !isCourier) return;
    setIsLoadingActive(true);
    try {
      const data = await customFetch<CourierOrder[]>("/api/courier/orders/active");
      setActiveOrders(Array.isArray(data) ? data : []);
    } catch {
      setActiveOrders([]);
    } finally {
      setIsLoadingActive(false);
    }
  }, [user, isCourier]);

  const acceptOrder = useCallback(
    async (orderId: string) => {
      await customFetch(`/api/courier/orders/${orderId}/accept`, { method: "POST" });
      await Promise.all([refreshAvailableOrders(), refreshActiveOrders()]);
    },
    [refreshAvailableOrders, refreshActiveOrders]
  );

  const updateDeliveryStatus = useCallback(
    async (orderId: string, status: "on_way" | "delivered") => {
      await customFetch(`/api/courier/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      });
      await refreshActiveOrders();
    },
    [refreshActiveOrders]
  );

  useEffect(() => {
    if (!isCourier) return;
    refreshAvailableOrders();
    refreshActiveOrders();
  }, [isCourier, user?.id]);

  useEffect(() => {
    if (!isCourier) return;
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        refreshAvailableOrders();
        refreshActiveOrders();
      }
    });
    return () => sub.remove();
  }, [isCourier, refreshAvailableOrders, refreshActiveOrders]);

  return (
    <CourierContext.Provider
      value={{
        availableOrders,
        activeOrders,
        isLoadingAvailable,
        isLoadingActive,
        refreshAvailableOrders,
        refreshActiveOrders,
        acceptOrder,
        updateDeliveryStatus,
      }}
    >
      {children}
    </CourierContext.Provider>
  );
}

export function useCourier() {
  const ctx = useContext(CourierContext);
  if (!ctx) throw new Error("useCourier must be used within CourierProvider");
  return ctx;
}
