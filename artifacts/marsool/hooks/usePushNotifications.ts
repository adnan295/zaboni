import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
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
  notification: Notifications.Notification | Notifications.NotificationResponse,
): NotificationData {
  return "notification" in notification
    ? notification.notification.request.content.data
    : notification.request.content.data;
}

function getNotificationTargetRoute(
  notification: Notifications.Notification | Notifications.NotificationResponse,
  userRole: "customer" | "courier",
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

  return null;
}

const handledResponseIds = new Set<string>();

const REGISTRATION_COOLDOWN_MS = 30_000;

async function getDevicePushTokenWithRetry(
  retries = 3,
  delayMs = 1500,
): Promise<Notifications.DevicePushToken | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await Notifications.getDevicePushTokenAsync();
    } catch (err) {
      console.warn(
        `[PushNotifications] getDevicePushTokenAsync attempt ${attempt}/${retries} failed:`,
        err,
      );
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#DC2626",
      sound: "default",
    });
  } catch (err) {
    console.warn("[PushNotifications] Channel setup failed:", err);
  }
}

async function registerForPush(authToken: string): Promise<void> {
  if (Platform.OS === "web") return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  await ensureAndroidChannel();

  const baseUrl = getApiBaseUrl();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  // 1) Save the native device token first (FCM on Android, APNs on iOS).
  // This is the channel that actually works on Replit-managed Expo accounts.
  const deviceTokenData = await getDevicePushTokenWithRetry();
  if (deviceTokenData?.data && typeof deviceTokenData.data === "string") {
    const payload =
      Platform.OS === "android"
        ? { fcmToken: deviceTokenData.data }
        : Platform.OS === "ios"
          ? { apnToken: deviceTokenData.data }
          : null;
    if (payload) {
      try {
        await fetch(`${baseUrl}/api/auth/device-tokens`, {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.warn("[PushNotifications] Failed to save device token:", err);
      }
    }
  }

  // 2) Try to also save the Expo push token as a secondary channel.
  // Wrapped separately so any failure here does NOT block the native flow above.
  try {
    const projectId = process.env["EXPO_PUBLIC_PROJECT_ID"];
    const expoTokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (expoTokenData?.data) {
      await fetch(`${baseUrl}/api/push-token`, {
        method: "POST",
        headers,
        body: JSON.stringify({ token: expoTokenData.data }),
      }).catch((err) => console.warn("[PushNotifications] Failed to save Expo token:", err));
    }
  } catch (err) {
    console.warn("[PushNotifications] Expo push token unavailable (native token already saved):", err);
  }
}

export function usePushNotifications(onNewOrderTap?: () => void) {
  const { token, user } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  const onNewOrderTapRef = useRef(onNewOrderTap);
  const userRoleRef = useRef<"customer" | "courier">(user?.role ?? "customer");
  const lastRegistrationRef = useRef<number>(0);
  routerRef.current = router;
  onNewOrderTapRef.current = onNewOrderTap;
  userRoleRef.current = user?.role ?? "customer";

  useEffect(() => {
    if (Platform.OS === "web" || !token) return;

    const tryRegister = () => {
      const now = Date.now();
      if (now - lastRegistrationRef.current < REGISTRATION_COOLDOWN_MS) return;
      lastRegistrationRef.current = now;
      registerForPush(token).catch((err) =>
        console.warn("Push notification registration failed:", err),
      );
    };

    // Register on login / token change
    tryRegister();

    // Re-register when app returns to foreground (catches token refresh)
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") tryRegister();
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => subscription.remove();
  }, [token]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleResponse = (
      response: Notifications.NotificationResponse,
      route: string,
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
      },
    );

    return () => subscription.remove();
  }, []);
}
