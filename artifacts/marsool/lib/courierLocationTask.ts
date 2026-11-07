import { Platform } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/lib/apiConfig";

// Live courier tracking while a delivery is in progress.
//
// Why this exists: the courier's phone is in their pocket while they ride, so
// the app is in the background and every setInterval/getCurrentPositionAsync
// loop in React is frozen by the OS. The customer then sees a frozen dot and
// thinks tracking is broken. The OS-level location task below keeps reporting
// the position with the app in the background: on Android through a foreground
// service (the persistent "توصيلة جارية" notification), on iOS through the
// `location` background mode (blue status bar). Neither needs the "Always"
// location permission — "While using the app" is enough.
//
// expo-task-manager is a native module that only exists in binaries built from
// 1.0.20 on. OTA updates also reach older binaries, where requiring it throws,
// so it is loaded lazily and the caller falls back to foreground pings.

export const COURIER_LOCATION_TASK = "zaboni-courier-location";
const TOKEN_KEY = "@marsool_jwt";
/** Seconds between pings while delivering. Customer polls every 5 s. */
const PING_INTERVAL_MS = 8000;
const PING_DISTANCE_M = 15;

type TaskManagerModule = {
  defineTask: (name: string, fn: (body: { data?: unknown; error?: unknown }) => void) => void;
  isTaskDefined: (name: string) => boolean;
  isAvailableAsync: () => Promise<boolean>;
};

function loadTaskManager(): TaskManagerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-task-manager") as TaskManagerModule;
  } catch {
    return null;
  }
}

let lastSentAt = 0;

/** Sends one position to the API. Reads the token itself: in a headless launch the
 *  React tree (and its auth getter) may not be mounted yet. */
export async function sendCourierLocation(lat: number, lon: number): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  await fetch(`${getApiBaseUrl()}/api/courier/location`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lat, lon }),
  });
}

// Task handlers must be registered in the global scope (module evaluation), not
// inside a component, so this runs when the module is first imported.
const taskManager = Platform.OS === "web" ? null : loadTaskManager();
if (taskManager && !taskManager.isTaskDefined(COURIER_LOCATION_TASK)) {
  taskManager.defineTask(COURIER_LOCATION_TASK, ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
    const latest = locations[locations.length - 1];
    if (!latest) return;
    // The OS may batch several fixes; only the newest matters and never more than
    // one request per interval.
    if (Date.now() - lastSentAt < PING_INTERVAL_MS / 2) return;
    lastSentAt = Date.now();
    void sendCourierLocation(latest.coords.latitude, latest.coords.longitude).catch(() => {});
  });
}

/** True when this binary can track in the background at all. */
export async function backgroundTrackingAvailable(): Promise<boolean> {
  if (!taskManager) return false;
  try {
    return await taskManager.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Starts OS-level position updates for an active delivery. Returns false when the
 *  binary or permissions don't allow it, so the caller keeps the foreground loop. */
export async function startDeliveryTracking(): Promise<boolean> {
  if (!(await backgroundTrackingAvailable())) return false;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return false;
    if (await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(COURIER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: PING_INTERVAL_MS,
      distanceInterval: PING_DISTANCE_M,
      deferredUpdatesInterval: PING_INTERVAL_MS,
      deferredUpdatesDistance: PING_DISTANCE_M,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "زبوني · توصيلة جارية",
        notificationBody: "عم نشارك موقعك مع الزبون لحتى تسلّم الطلب",
        notificationColor: "#DC2626",
        killServiceOnDestroy: true,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopDeliveryTracking(): Promise<void> {
  if (!taskManager) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(COURIER_LOCATION_TASK);
    }
  } catch {
  }
}
