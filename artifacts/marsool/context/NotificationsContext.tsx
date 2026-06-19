import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/i18n";
import { getApiBaseUrl } from "@/lib/apiConfig";

const STORAGE_KEY = "@marsool_notifications";
const READ_IDS_KEY = "@marsool_notif_read_ids";
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
  createdAt: string;
}

async function fetchServerNotifications(): Promise<ServerNotif[]> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return [];
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

function mergeNotifications(
  local: AppNotification[],
  serverItems: ServerNotif[],
  readIds: Set<string>,
): AppNotification[] {
  const localIds = new Set(local.map((n) => n.id));
  const serverNotifs: AppNotification[] = serverItems
    .filter((s) => !localIds.has(`srv_${s.id}`))
    .map((s) => ({
      id: `srv_${s.id}`,
      type: "promo" as NotifType,
      title: s.title,
      body: s.body,
      read: readIds.has(`srv_${s.id}`),
      createdAt: new Date(s.createdAt).getTime(),
    }));
  const combined = [...local, ...serverNotifs];
  combined.sort((a, b) => b.createdAt - a.createdAt);
  return combined.slice(0, 60);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [raw, readRaw, serverItems] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(READ_IDS_KEY),
        fetchServerNotifications(),
      ]);

      if (cancelled) return;

      const readIds: Set<string> = new Set(readRaw ? (JSON.parse(readRaw) as string[]) : []);
      readIdsRef.current = readIds;

      let local: AppNotification[];
      if (raw) {
        local = JSON.parse(raw) as AppNotification[];
      } else {
        local = buildSeedNotifications();
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(local));
      }

      if (cancelled) return;
      setNotifications(mergeNotifications(local, serverItems, readIds));
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
      const entry: AppNotification = {
        ...n,
        id,
        read: false,
        createdAt: Date.now(),
      };
      setNotifications((prev) => {
        const next = [entry, ...prev].slice(0, 60);
        const localOnly = next.filter((x) => !x.id.startsWith("srv_"));
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localOnly)).catch(() => {});
        return next;
      });
      showToast({ id, type: n.type, title: n.title, body: n.body });
    },
    [showToast],
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      if (id.startsWith("srv_")) {
        readIdsRef.current.add(id);
        AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...readIdsRef.current])).catch(() => {});
      } else {
        const localOnly = next.filter((x) => !x.id.startsWith("srv_"));
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localOnly)).catch(() => {});
      }
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      const serverIds = next.filter((n) => n.id.startsWith("srv_")).map((n) => n.id);
      serverIds.forEach((sid) => readIdsRef.current.add(sid));
      if (serverIds.length > 0) {
        AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...readIdsRef.current])).catch(() => {});
      }
      const localOnly = next.filter((x) => !x.id.startsWith("srv_"));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localOnly)).catch(() => {});
      return next;
    });
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (id.startsWith("srv_")) {
        readIdsRef.current.add(id);
        AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...readIdsRef.current])).catch(() => {});
      } else {
        const localOnly = next.filter((x) => !x.id.startsWith("srv_"));
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(localOnly)).catch(() => {});
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications((prev) => {
      const serverItems = prev.filter((n) => n.id.startsWith("srv_"));
      serverItems.forEach((n) => readIdsRef.current.add(n.id));
      if (serverItems.length > 0) {
        AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...readIdsRef.current])).catch(() => {});
      }
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return serverItems.map((n) => ({ ...n, read: true }));
    });
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
