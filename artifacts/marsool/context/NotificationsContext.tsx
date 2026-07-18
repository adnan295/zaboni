import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/lib/apiConfig";

const STORAGE_KEY = "@marsool_notifications";
const AUTH_TOKEN_KEY = "@marsool_jwt";
const DISMISSED_IDS_KEY = "@marsool_dismissed_notif_ids";
const READ_IDS_KEY = "@marsool_read_notif_ids";

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
  refreshing: boolean;
  refresh: () => Promise<void>;
  dismissToast: () => void;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

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

async function getDismissedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_IDS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function getReadIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_IDS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function addToDismissed(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(id)) {
      await AsyncStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify([...ids, id]));
    }
  } catch {
    // silent
  }
}

async function addToRead(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(READ_IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(id)) {
      await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids, id]));
    }
  } catch {
    // silent
  }
}

async function addManyToRead(newIds: string[]): Promise<void> {
  if (newIds.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(READ_IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const merged = Array.from(new Set([...ids, ...newIds]));
    await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(merged));
  } catch {
    // silent
  }
}

async function addManyToDismissed(newIds: string[]): Promise<void> {
  if (newIds.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_IDS_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const merged = Array.from(new Set([...existing, ...newIds]));
    await AsyncStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify(merged));
  } catch {
    // silent
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authTokenRef = useRef<string | null>(null);

  // Pull the latest notifications from the server and merge them with any
  // live, local-only items (e.g. a push received while the app was open that
  // isn't persisted server-side yet). Returns true when server data was
  // applied. Safe to call repeatedly — on every screen focus / pull-to-refresh.
  const loadFromServer = useCallback(async (): Promise<boolean> => {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    authTokenRef.current = token;
    if (!token) return false;

    const [serverItems, dismissedIds, readIds] = await Promise.all([
      fetchServerNotifications(token),
      getDismissedIds(),
      getReadIds(),
    ]);
    if (serverItems.length === 0) return false;

    const serverIds = new Set(serverItems.map((n) => n.id));

    // Trim dismissed set to only IDs still on server (prevent unbounded growth)
    const trimmedDismissed = [...dismissedIds].filter((id) => serverIds.has(id));
    if (trimmedDismissed.length !== dismissedIds.size) {
      AsyncStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify(trimmedDismissed)).catch(() => {});
    }

    const mapped = serverItems
      .filter((n) => !dismissedIds.has(n.id))
      .map((n) => ({
        ...serverToApp(n),
        read: readIds.has(n.id) || (n.isRead ?? false),
      }));
    const mappedIds = new Set(mapped.map((n) => n.id));

    setNotifications((prev) => {
      // Keep live, local-only entries that aren't represented on the server,
      // but drop ones that clearly duplicate a server item (same title+body,
      // created within a few minutes) to avoid showing the notification twice.
      const isServerDup = (local: AppNotification) =>
        mapped.some(
          (s) =>
            s.title === local.title &&
            s.body === local.body &&
            Math.abs(s.createdAt - local.createdAt) < 5 * 60_000,
        );
      const localOnly = prev.filter((n) => !mappedIds.has(n.id) && !isServerDup(n));
      return [...mapped, ...localOnly]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 60);
    });
    return true;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFromServer();
    } catch {
      // silent — keep whatever is currently shown
    } finally {
      setRefreshing(false);
    }
  }, [loadFromServer]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const hadServer = await loadFromServer().catch(() => false);
      if (cancelled || hadServer) return;
      // Fallback: read from AsyncStorage cache when the server has nothing
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (cancelled || !raw) return;
      setNotifications(JSON.parse(raw) as AppNotification[]);
    })().catch(() => {});

    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadFromServer]);

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
    // Persist read state locally so it survives app restarts
    addToRead(id).catch(() => {});
    // Sync to server
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
      if (token) markReadOnServer(id, token).catch(() => {});
    }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const unreadIds = prev.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length > 0) {
        // Persist all as read locally
        addManyToRead(unreadIds).catch(() => {});
        // Sync to server
        AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
          if (token) unreadIds.forEach((id) => markReadOnServer(id, token).catch(() => {}));
        }).catch(() => {});
      }
      return prev.map((n) => ({ ...n, read: true }));
    });
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    // Persist dismissal locally so it survives app restarts
    addToDismissed(id).catch(() => {});
    // Sync to server
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
      if (token) deleteOnServer(id, token).catch(() => {});
    }).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setNotifications((prev) => {
      const allIds = prev.map((n) => n.id);
      // Persist all as dismissed locally
      addManyToDismissed(allIds).catch(() => {});
      // Sync deletions to server
      AsyncStorage.getItem(AUTH_TOKEN_KEY).then((token) => {
        if (token) prev.forEach((n) => deleteOnServer(n.id, token).catch(() => {}));
      }).catch(() => {});
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      return [];
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, toast, refreshing, refresh, dismissToast, addNotification, markRead, markAllRead, deleteNotification, clearAll }}
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
