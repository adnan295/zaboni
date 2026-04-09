import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState, AppStateStatus, Vibration } from "react-native";
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
  deliveryFee?: number | null;
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

const POLL_INTERVAL_MS = 8000;

export function CourierProvider({ children }: { children: React.ReactNode }) {
  const { user, isCourier } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<CourierOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<CourierOrder[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const lastKnownIdsRef = useRef<Set<string>>(new Set());
  const isFirstFetchRef = useRef(true);

  const refreshAvailableOrders = useCallback(async () => {
    if (!user || !isCourier) return;
    setIsLoadingAvailable(true);
    try {
      const data = await customFetch<CourierOrder[]>("/api/courier/orders/available");
      const newOrders = Array.isArray(data) ? data : [];

      if (!isFirstFetchRef.current) {
        const hasNew = newOrders.some((o) => !lastKnownIdsRef.current.has(o.id));
        if (hasNew) {
          Vibration.vibrate([0, 400, 200, 400]);
        }
      } else {
        isFirstFetchRef.current = false;
      }

      lastKnownIdsRef.current = new Set(newOrders.map((o) => o.id));
      setAvailableOrders(newOrders);
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
      if (status !== "delivered") {
        await refreshActiveOrders();
      }
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
        isFirstFetchRef.current = true;
        await refreshAvailableOrders();
      } else {
        setAvailableOrders([]);
        lastKnownIdsRef.current = new Set();
        isFirstFetchRef.current = true;
      }
    } catch {
    } finally {
      setIsTogglingOnline(false);
    }
  }, [isOnline, refreshAvailableOrders]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      if (isOnlineRef.current) {
        refreshAvailableOrders();
      }
      refreshActiveOrders();
    }, POLL_INTERVAL_MS);
  }, [refreshAvailableOrders, refreshActiveOrders]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isCourier) return;
    fetchOnlineStatus();
    refreshAvailableOrders();
    refreshActiveOrders();
    startPolling();
    return () => stopPolling();
  }, [isCourier, user?.id]);

  useEffect(() => {
    if (!isCourier) return;
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        refreshAvailableOrders();
        refreshActiveOrders();
        startPolling();
      } else if (nextState === "background" || nextState === "inactive") {
        stopPolling();
      }
    });
    return () => sub.remove();
  }, [isCourier, refreshAvailableOrders, refreshActiveOrders, startPolling, stopPolling]);

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
