import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AppState, AppStateStatus, Platform, Vibration } from "react-native";
import * as Location from "expo-location";
import { io } from "socket.io-client";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/apiConfig";

export type CourierOrderStatus = "searching" | "accepted" | "picked_up" | "on_way" | "delivered";

export interface CourierOrder {
  id: string;
  userId: string;
  orderText: string;
  restaurantName: string;
  restaurantPhone: string;
  status: CourierOrderStatus;
  courierName: string;
  courierPhone: string;
  courierRating: number;
  courierId: string;
  address: string;
  estimatedMinutes: number;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  distanceKm?: number;
  destinationLat?: number | null;
  destinationLon?: number | null;
  restaurantLat?: number | null;
  restaurantLon?: number | null;
  deliveryFee?: number | null;
  flashDealDiscount?: number | null;
  totalPrice?: number | null;
  orderType?: string;
  placeName?: string | null;
}

export type CourierDeliveryStatus = "picked_up" | "on_way" | "delivered";

interface CourierContextValue {
  availableOrders: CourierOrder[];
  activeOrders: CourierOrder[];
  availableOrdersError: boolean;
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
  getCourierOrder: (id: string) => CourierOrder | undefined;
}

const CourierContext = createContext<CourierContextValue | null>(null);

const POLL_INTERVAL_MS = 8000;
// How often an online / actively-delivering courier reports its position so the
// admin live map and the customer's tracking map can follow it.
const LOCATION_PUSH_INTERVAL_MS = 15000;

export function CourierProvider({ children }: { children: React.ReactNode }) {
  const { user, isCourier, token } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<CourierOrder[]>([]);
  const [activeOrders, setActiveOrders] = useState<CourierOrder[]>([]);
  const [availableOrdersError, setAvailableOrdersError] = useState(false);
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
      setAvailableOrdersError(false);
    } catch {
      setAvailableOrdersError(true);
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
    const prevStatus = isOnline;
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
      setIsOnline(prevStatus);
      throw new Error("toggle_failed");
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

  // Report the courier's live position whenever they're online OR mid-delivery,
  // so the admin live map shows every available courier (not just those on an
  // active order) and the customer's tracking map can follow theirs. One loop
  // here is the single source of location pushing across all courier screens.
  const locationPermRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isCourier || Platform.OS === "web") return;
    const shouldTrack = isOnline || activeOrders.length > 0;
    if (!shouldTrack) return;
    let cancelled = false;
    const push = async () => {
      try {
        if (locationPermRef.current === null) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          locationPermRef.current = status === "granted";
        }
        if (!locationPermRef.current || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) void updateLocation(pos.coords.latitude, pos.coords.longitude);
      } catch {
      }
    };
    push();
    const timer = setInterval(push, LOCATION_PUSH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isCourier, isOnline, activeOrders.length, user?.id, updateLocation]);

  useEffect(() => {
    if (!isCourier || !token) return;
    const base = Platform.OS === "web" ? "" : getApiBaseUrl();
    const socket = io(`${base}/orders`, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
    });
    socket.on("order_taken", ({ orderId }: { orderId: string }) => {
      setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
      lastKnownIdsRef.current.delete(orderId);
    });
    return () => {
      socket.disconnect();
    };
  }, [isCourier, token]);

  return (
    <CourierContext.Provider
      value={{
        availableOrders,
        activeOrders,
        availableOrdersError,
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
        getCourierOrder: (id: string) => activeOrders.find((o) => o.id === id),
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
