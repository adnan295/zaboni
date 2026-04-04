import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
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

export function usePushNotifications() {
  const { token } = useAuth();

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
}
