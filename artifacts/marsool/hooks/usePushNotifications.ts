import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { useAuth } from "@/context/AuthContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type NotificationData = Record<string, unknown> | null | undefined;

function getNotificationData(
  notification: Notifications.Notification | Notifications.NotificationResponse
): NotificationData {
  return "notification" in notification
    ? notification.notification.request.content.data
    : notification.request.content.data;
}

function getNotificationTargetRoute(
  notification: Notifications.Notification | Notifications.NotificationResponse,
  userRole: "customer" | "courier"
): string | null {
  const data = getNotificationData(notification);
  const type = data?.type as string | undefined;
  const orderId = data?.orderId as string | undefined;

  if (type === "new_order") {
    return "/(courier)/available";
  }

  if (type === "order_update") {
    if (userRole === "courier") {
      return "/(courier)/active";
    }
    if (orderId) {
      return `/order-tracking/${orderId}` as string;
    }
    return "/(tabs)";
  }

  if (type === "chat_message") {
    if (orderId) {
      return `/chat/${orderId}` as string;
    }
    return null;
  }

  return null;
}

const handledResponseIds = new Set<string>();

export function usePushNotifications(onNewOrderTap?: () => void) {
  const { token, user } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  const onNewOrderTapRef = useRef(onNewOrderTap);
  const userRoleRef = useRef<"customer" | "courier">(user?.role ?? "customer");
  routerRef.current = router;
  onNewOrderTapRef.current = onNewOrderTap;
  userRoleRef.current = user?.role ?? "customer";

  useEffect(() => {
    if (Platform.OS === "web" || !token) return;

    (async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") return;

        const projectId = process.env["EXPO_PUBLIC_PROJECT_ID"];
        const pushToken = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        if (!pushToken?.data) return;

        const baseUrl = getApiBaseUrl();
        await fetch(`${baseUrl}/api/push-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token: pushToken.data }),
        });
      } catch (err) {
        console.warn("Push notification registration failed:", err);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleResponse = (
      response: Notifications.NotificationResponse,
      route: string
    ) => {
      const id = response.notification.request.identifier;
      if (handledResponseIds.has(id)) return;
      handledResponseIds.add(id);
      routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0]);
      const data = getNotificationData(response);
      if ((data?.type as string | undefined) === "new_order") {
        onNewOrderTapRef.current?.();
      }
    };

    (async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const route = getNotificationTargetRoute(lastResponse, userRoleRef.current);
          if (route) handleResponse(lastResponse, route);
        }
      } catch {
      }
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const route = getNotificationTargetRoute(response, userRoleRef.current);
        if (route) handleResponse(response, route);
      }
    );

    return () => subscription.remove();
  }, []);
}
