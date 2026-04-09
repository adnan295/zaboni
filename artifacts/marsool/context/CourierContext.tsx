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

export type CourierOrderStatus = "searching" | "accepted" | "picked_up" | "on_way" | "delivered";

export interface CourierOrder {
  id: string;
  userId: string;
  orderText: string;
  restaurantName: string;
  status: CourierOrderStatus;
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  address: string;
  estimatedMinutes: number;
  createdAt: string;
  distanceKm?: number;
  destinationLat?: number | null;
  destinationLon?: number | null;
}

export type CourierDeliveryStatus = "picked_up" | "on_way" | "delivered";

interface CourierContextValue {
  availableOrders: CourierOrder[];
  activeOrders: CourierOrder[];
  isLoadingAvailable: boolean;
  isLoadingActive: boolean;
  isOnline: boolean;
  isTogglingOnline: boolean;
  refreshAvailableOrders: () => Promise<void>;
  refreshActiveOrders: () => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  updateDeliveryStatus: (orderId: string, status: CourierDeliveryStatus) => Promise<void>;
  updateLocation: (lat: number, lon: number) => Promise<void>;
  toggleAvailability: () => Promise<void>;
}

const CourierContext = createContext<CourierContextValue | null>(null);

export function CourierProvider({ children }: { children: React.ReactNode }) {
  const { user, isCourier } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<CourierOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<CourierOrder[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);

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

  const fetchOnlineStatus = useCallback(async () => {
    if (!user || !isCourier) return;
    try {
      const data = await customFetch<{ isOnline: boolean }>("/api/courier/me");
      setIsOnline(data.isOnline ?? true);
    } catch {
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
    async (orderId: string, status: CourierDeliveryStatus) => {
      await customFetch(`/api/courier/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      });
      await refreshActiveOrders();
    },
    [refreshActiveOrders]
  );

  const updateLocation = useCallback(async (lat: number, lon: number) => {
    try {
      await customFetch("/api/courier/location", {
        method: "PATCH",
        body: JSON.stringify({ lat, lon }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
    }
  }, []);

  const toggleAvailability = useCallback(async () => {
    setIsTogglingOnline(true);
    try {
      const newStatus = !isOnline;
      await customFetch("/api/courier/availability", {
        method: "PATCH",
        body: JSON.stringify({ isOnline: newStatus }),
        headers: { "Content-Type": "application/json" },
      });
      setIsOnline(newStatus);
      if (newStatus) {
        await refreshAvailableOrders();
      } else {
        setAvailableOrders([]);
      }
    } catch {
    } finally {
      setIsTogglingOnline(false);
    }
  }, [isOnline, refreshAvailableOrders]);

  useEffect(() => {
    if (!isCourier) return;
    fetchOnlineStatus();
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
        isOnline,
        isTogglingOnline,
        refreshAvailableOrders,
        refreshActiveOrders,
        acceptOrder,
        updateDeliveryStatus,
        updateLocation,
        toggleAvailability,
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
