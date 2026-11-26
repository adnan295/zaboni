import type * as Notifications from "expo-notifications";

type Data = Record<string, unknown>;

/**
 * The data our server attaches to a push (type, orderId…), wherever the phone put it.
 * Expo's own pushes carry it on `content.data`; a push our server sends straight
 * through FCM (Android) or APNs (iPhone) carries it on the trigger instead:
 * `remoteMessage.data` on Android, the raw `payload` on iPhone. Reading only
 * `content.data` made chat alerts open the notifications page.
 */
export function pushData(request: Notifications.NotificationRequest): Data | undefined {
  const content = request.content.data as Data | null | undefined;
  if (content && Object.keys(content).length > 0) return content;
  const trigger = request.trigger as { remoteMessage?: { data?: Data }; payload?: Data } | null;
  const android = trigger?.remoteMessage?.data;
  if (android && typeof android === "object") {
    if (typeof android.body === "string" && android.type == null) {
      try { return JSON.parse(android.body) as Data; } catch {}
    }
    return android;
  }
  const ios = trigger?.payload;
  if (ios && typeof ios === "object") {
    const { aps: _aps, ...rest } = ios;
    if (rest.body && typeof rest.body === "object" && (rest.body as Data).type != null) return rest.body as Data;
    return rest;
  }
  return content ?? undefined;
}
