import { useEffect, useRef } from "react";
import { Alert, Linking, AppState, type AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { registerForPush } from "@/lib/pushRegistration";
import { useRouter } from "expo-router";
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

type NotifType = "order_status" | "promo" | "rating_request" | "system";

type AddNotificationFn = (n: {
  type: NotifType;
  title: string;
  body: string;
  orderId?: string;
}) => void;

type NotificationData = Record<string, unknown> | null | undefined;

function getNotificationData(
  notification: Notifications.Notification | Notifications.NotificationResponse,
): NotificationData {
  return "notification" in notification
    ? notification.notification.request.content.data
    : notification.request.content.data;
}

function getNotificationContent(
  notification: Notifications.Notification | Notifications.NotificationResponse,
): { title: string; body: string } {
  const content =
    "notification" in notification
      ? notification.notification.request.content
      : notification.request.content;
  return {
    title: content.title ?? "",
    body: content.body ?? "",
  };
}

function pushTypeToNotifType(type: string | undefined): NotifType {
  if (type === "order_update" || type === "new_order") return "order_status";
  if (type === "flash_deal") return "promo";
  return "system";
}

function getNotificationTargetRoute(
  notification: Notifications.Notification | Notifications.NotificationResponse,
  userRole: "customer" | "courier",
): string {
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

  if (type === "flash_deal") {
    const restaurantId = data?.restaurantId as string | undefined;
    if (restaurantId) {
      return `/restaurant/${restaurantId}` as string;
    }
    return "/(tabs)";
  }

  if (type === "referral") {
    return "/(tabs)/profile";
  }

  return "/notifications";
}

const handledResponseIds = new Set<string>();
const handledReceivedIds = new Set<string>();
// Persisted id of the launch notification already routed, so a tap doesn't
// re-open its screen on every subsequent cold start.
const LAUNCH_NOTIF_KEY = "@zaboni_handled_launch_notif_v1";

export function usePushNotifications(
  onNewOrderTap?: () => void,
  addNotification?: AddNotificationFn,
) {
  const { token, user } = useAuth();
  const router = useRouter();
  const routerRef = useRef(router);
  const onNewOrderTapRef = useRef(onNewOrderTap);
  const addNotificationRef = useRef(addNotification);
  const userRoleRef = useRef<"customer" | "courier">(user?.role ?? "customer");
  routerRef.current = router;
  onNewOrderTapRef.current = onNewOrderTap;
  addNotificationRef.current = addNotification;
  userRoleRef.current = user?.role ?? "customer";

  useEffect(() => {
    if (Platform.OS === "web" || !token) return;

    let disposed = false;
    let inFlight = false;
    let warned = false;
    let tokenChanged = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const tryRegister = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      clearTimeout(retryTimer);
      let ready = false;
      try {
        const result = await registerForPush(token);
        ready = result.ready && !result.retrySoon;
        if (!disposed && !result.ready && userRoleRef.current === "courier" && !warned) {
          warned = true;
          Alert.alert("تنبيهات الطلبات غير جاهزة", result.message, [
            { text: "فتح الإعدادات", onPress: () => { void Linking.openSettings(); } },
            { text: "حسناً", style: "cancel" },
          ]);
        }
      } catch (err) { console.warn("Push notification registration failed", err); }
      finally {
        inFlight = false;
        if (!disposed && tokenChanged) {
          tokenChanged = false;
          void tryRegister();
        } else if (!disposed) retryTimer = setTimeout(() => {
          if (AppState.currentState === "active") void tryRegister();
        }, ready ? 10 * 60_000 : 30_000);
      }
    };
    void tryRegister();
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void tryRegister();
    });
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      if (inFlight) tokenChanged = true;
      else void tryRegister();
    });
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      subscription.remove();
      tokenSubscription.remove();
    };
  }, [token]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const addToInbox = (
      notification: Notifications.Notification | Notifications.NotificationResponse,
      inboxId: string,
    ) => {
      if (handledReceivedIds.has(inboxId)) return;
      handledReceivedIds.add(inboxId);
      const data = getNotificationData(notification);
      const { title, body } = getNotificationContent(notification);
      if (!title && !body) return;
      addNotificationRef.current?.({
        type: pushTypeToNotifType(data?.type as string | undefined),
        title,
        body,
        orderId: data?.orderId as string | undefined,
      });
    };

    const handleResponse = (
      response: Notifications.NotificationResponse,
      route: string,
    ) => {
      const id = response.notification.request.identifier;
      if (handledResponseIds.has(id)) return;
      handledResponseIds.add(id);

      addToInbox(response, `tap-${id}`);

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
          // getLastNotificationResponseAsync keeps returning the SAME last-tapped
          // notification on every cold start, so without a persistent guard the
          // app re-navigates to that notification's screen (e.g. Notifications or
          // a restaurant) on every launch instead of opening to Home. Persist the
          // handled id so each tap only routes once, across restarts.
          const id = lastResponse.notification.request.identifier;
          const handled = await AsyncStorage.getItem(LAUNCH_NOTIF_KEY);
          if (handled !== id) {
            await AsyncStorage.setItem(LAUNCH_NOTIF_KEY, id);
            const route = getNotificationTargetRoute(lastResponse, userRoleRef.current);
            handleResponse(lastResponse, route);
          }
        }
      } catch {
      }
    })();

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const route = getNotificationTargetRoute(response, userRoleRef.current);
        handleResponse(response, route);
      },
    );

    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        addToInbox(notification, notification.request.identifier);
        const data = getNotificationData(notification);
        if ((data?.type as string | undefined) === "new_order") {
          onNewOrderTapRef.current?.();
        }
      },
    );

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, []);
}
