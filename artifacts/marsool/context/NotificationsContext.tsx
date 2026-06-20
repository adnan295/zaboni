import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";
import { getApiBaseUrl } from "@/lib/apiConfig";

const STORAGE_KEY = "@marsool_notifications";
const AUTH_TOKEN_KEY = "@marsool_jwt";

export type NotifType = "order_status" | "promo" | "rating_request" | "system";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  orderId?: string;
}

export interface ToastPayload {
  id: string;
  type: NotifType;
  title: string;
  body: string;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  toast: ToastPayload | null;
  dismissToast: () => void;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function buildSeedNotifications(): AppNotification[] {
  return [
    {
      id: "welcome-1",
      type: "promo",
      title: i18n.t("notifications.seed.welcome1Title"),
      body: i18n.t("notifications.seed.welcome1Body"),
      read: false,
      createdAt: Date.now(),
    },
    {
      id: "welcome-2",
      type: "promo",
      title: i18n.t("notifications.seed.welcome2Title"),
      body: i18n.t("notifications.seed.welcome2Body"),
      read: false,
      createdAt: Date.now() - 600000,
    },
  ];
}

interface ServerNotif {
  id: string;
  title: string;
  body: string;
  type?: NotifType;
  orderId?: string | null;
  isRead?: boolean;
  createdAt: string;
}

async function fetchServerNotifications(token: string): Promise<ServerNotif[]> {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as ServerNotif[];
  } catch {
    return [];
  }
}

async function markReadOnServer(id: string, token: string): Promise<void> {
  if (id.startsWith("welcome-")) return;
  try {
    const baseUrl = getApiBaseUrl();
    await fetch(`${baseUrl}/api/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // silent
  }
}

async function deleteOnServer(id: string, token: string): Promise<void> {
  if (id.startsWith("welcome-")) return;
  try {
    const baseUrl = getApiBaseUrl();
    await fetch(`${baseUrl}/api/notifications/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // silent
  }
}

function serverToApp(s: ServerNotif): AppNotification {
  return {
    id: s.id,
    type: s.type ?? "system",
    title: s.title,
    body: s.body,
    read: s.isRead ?? false,
    createdAt: new Date(s.createdAt).getTime(),
    orderId: s.orderId ?? undefined,
  };
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      authTokenRef.current = token;

      if (token) {
        const serverItems = await fetchServerNotifications(token);
        if (cancelled) return;
        if (serverItems.length > 0) {
          const mapped = serverItems.map(serverToApp);
          setNotifications(mapped);
          return;
        }
      }

      // Fallback: read from AsyncStorage cache
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (cancelled) return;
      if (raw) {
        setNotifications(JSON.parse(raw) as AppNotification[]);
      } else {
        const seed = buildSeedNotifications();
        setNotifications(seed);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      }
    }

    load().catch(() => {});

    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }, []);

  const showToast = useCallback((payload: ToastPayload) => {
    setToast(payload);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3000);
  }, []);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "read" | "createdAt">) => {
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 6);
      const entry: AppNotification = { ...n, id, read: false, createdAt: Date.now() };
      setNotifications((prev) => {
        const next = [entry, ...prev].slice(0, 60);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next.filter((x) => !x.id.startsWith("un_") && !x.id.startsWith("bcast_")))).catch(() => {});
        return next;
      });
      showToast({ id, type: n.type, title: n.title, body: n.body });
    },
    [showToast],
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
      if (token) markReadOnServer(id, token).catch(() => {});
    }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
        if (token) {
          prev.filter((n) => !n.read).forEach((n) => markReadOnServer(n.id, token).catch(() => {}));
        }
      }).catch(() => {});
      return next;
    });
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
      if (token) deleteOnServer(id, token).catch(() => {});
    }).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
      if (!token) return;
      setNotifications((prev) => {
        prev.forEach((n) => deleteOnServer(n.id, token).catch(() => {}));
        return [];
      });
    }).catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, toast, dismissToast, addNotification, markRead, markAllRead, deleteNotification, clearAll }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
