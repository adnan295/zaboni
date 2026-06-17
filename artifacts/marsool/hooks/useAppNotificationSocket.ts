import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/lib/apiConfig";
import type { AppNotification } from "@/context/NotificationsContext";

type AddNotificationFn = (
  n: Omit<AppNotification, "id" | "read" | "createdAt">,
) => void;

interface AppNotificationPayload {
  title: string;
  body: string;
  type?: string;
  target?: string;
}

export function useAppNotificationSocket(
  authToken: string | null,
  addNotification: AddNotificationFn | undefined,
) {
  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;

  useEffect(() => {
    if (!authToken) return;

    const base = Platform.OS === "web" ? "" : getApiBaseUrl();
    const socketUrl = base || window?.location?.origin || "";

    const socket: Socket = io(`${socketUrl}/orders`, {
      auth: { token: authToken },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
    });

    socket.on("app_notification", (payload: AppNotificationPayload) => {
      const { title, body } = payload;
      if (!title && !body) return;
      addNotificationRef.current?.({
        type: "system",
        title: title ?? "",
        body: body ?? "",
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [authToken]);
}
