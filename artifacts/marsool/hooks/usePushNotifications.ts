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

function getNotificationTargetRoute(
  notification: Notifications.Notification | Notifications.NotificationResponse
): string | null {
  const data =
    "notification" in notification
      ? notification.notification.request.content.data
      : notification.request.content.data;

  if (data?.type === "new_order") return "/(courier)/available";
  if (data?.type === "order_update") return "/(courier)/active";
  return null;
}

export function usePushNotifications() {
  const { token } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

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

        const pushToken = await Notifications.getExpoPushTokenAsync();
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

    (async () => {
      try {
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const route = getNotificationTargetRoute(lastResponse);
          if (route) {
            routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0]);
          }
        }
      } catch {
      }
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const route = getNotificationTargetRoute(response);
        if (route) {
          routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0]);
        }
      }
    );

    return () => subscription.remove();
  }, []);
}
