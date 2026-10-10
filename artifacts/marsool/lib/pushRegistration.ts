import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { getApiBaseUrl } from "@/lib/apiConfig";

export type PushRegistration = {
  ready: boolean;
  retrySoon?: boolean;
  message?: string;
};
export async function withRegistrationTimeout<T>(
  work: Promise<T>,
  ms = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("notification_registration_timeout")),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function savePushToken(
  authToken: string,
  path: string,
  method: string,
  payload: Record<string, string>,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (response.ok) return;
      // Retrying an expired session cannot fix registration.
      if (response.status === 401 || response.status === 403)
        throw new Error("push_auth_required");
      throw new Error(`push_registration_http_${response.status}`);
    } catch (err) {
      if (
        attempt === 2 ||
        (err instanceof Error && err.message === "push_auth_required")
      )
        throw err;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
  }
}

export async function registerForPush(
  authToken: string,
): Promise<PushRegistration> {
  if (Platform.OS === "web") return { ready: true };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return {
      ready: false,
      message: "تنبيهات الطلبات تحتاج نسخة التطبيق المثبتة من المتجر.",
    };
  }
  // Android 13: create the channel before permission/token registration.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "تنبيهات زبوني",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#DC2626",
      sound: "default",
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted")
    permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") {
    return {
      ready: false,
      message:
        "فعّل إشعارات زبوني من إعدادات الهاتف حتى تنتبه للطلبات والتطبيق مغلق.",
    };
  }
  if (
    Platform.OS === "ios" &&
    (permission.ios?.allowsAlert === false ||
      permission.ios?.allowsSound === false)
  ) {
    return {
      ready: false,
      message:
        "فعّل التنبيهات والصوت لزبوني من إعدادات إشعارات الآيفون حتى تنتبه للطلبات.",
    };
  }
  if (Platform.OS === "android") {
    const channel = await Notifications.getNotificationChannelAsync("default");
    if (
      !channel ||
      channel.importance < Notifications.AndroidImportance.HIGH ||
      channel.sound === null
    ) {
      return {
        ready: false,
        message:
          "فعّل صوت تنبيهات زبوني وظهورها على الشاشة من إعدادات إشعارات التطبيق.",
      };
    }
  }
  // Independent paths: a stalled native token must not suppress Expo fallback.
  const results = await Promise.allSettled([
    (async () => {
      const token = await withRegistrationTimeout(
        Notifications.getDevicePushTokenAsync(),
      );
      if (typeof token.data !== "string" || !token.data)
        throw new Error("missing_native_token");
      await savePushToken(
        authToken,
        "/api/auth/device-tokens",
        "PUT",
        Platform.OS === "android"
          ? { fcmToken: token.data }
          : { apnToken: token.data },
      );
    })(),
    (async () => {
      const projectId =
        Constants.easConfig?.projectId ??
        Constants.expoConfig?.extra?.eas?.projectId ??
        process.env["EXPO_PUBLIC_PROJECT_ID"];
      const token = await withRegistrationTimeout(
        Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        ),
      );
      if (!token.data) throw new Error("missing_expo_token");
      await savePushToken(authToken, "/api/push-token", "POST", {
        token: token.data,
      });
    })(),
  ]);
  for (const result of results)
    if (result.status === "rejected")
      console.warn("Push registration path failed", result.reason);
  return results.some((r) => r.status === "fulfilled")
    ? { ready: true, retrySoon: results.some((r) => r.status === "rejected") }
    : {
        ready: false,
        message:
          "تعذّر تسجيل الهاتف لتنبيهات الطلبات. تأكد من الإنترنت وأعد المحاولة أو سجّل الدخول مجدداً.",
      };
}
