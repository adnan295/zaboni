import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@marsool_notifications";

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

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        setNotifications(JSON.parse(raw));
      } else {
        const welcome: AppNotification[] = [
          {
            id: "welcome-1",
            type: "promo",
            title: "مرحباً بك في مرسول! 🎉",
            body: "استخدم كود WELCOME للحصول على خصم 25% على أول طلب",
            read: false,
            createdAt: Date.now(),
          },
          {
            id: "welcome-2",
            type: "promo",
            title: "عرض محدود: توصيل مجاني",
            body: "اطلب الآن واستمتع بتوصيل مجاني على طلبات فوق 50 ريال",
            read: false,
            createdAt: Date.now() - 600000,
          },
        ];
        setNotifications(welcome);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(welcome));
      }
    });
  }, []);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "read" | "createdAt">) => {
      const entry: AppNotification = {
        ...n,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
        read: false,
        createdAt: Date.now(),
      };
      setNotifications((prev) => {
        const next = [entry, ...prev].slice(0, 50);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
