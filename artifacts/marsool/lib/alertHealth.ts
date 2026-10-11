import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Checks whether a courier's phone will actually ring for a new order while
// the app is in the background: notification permission, the alert channel's
// importance/sound, and Android battery optimization (which lets the OS delay
// or drop pushes on many Android phones, especially Xiaomi/Huawei/Oppo).
//
// expo-battery is a native module that only exists in binaries built from
// 1.0.19 on. OTA updates also reach older binaries (same runtimeVersion), where
// requiring it throws — so it is loaded lazily and reported as "unknown".

export type AlertHealth = {
  notifications: "ok" | "off";
  battery: "ok" | "restricted" | "unknown";
};

type BatteryModule = { isBatteryOptimizationEnabledAsync: () => Promise<boolean> };

function loadBattery(): BatteryModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-battery") as BatteryModule;
  } catch {
    return null;
  }
}

async function checkNotifications(): Promise<AlertHealth["notifications"]> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") return "off";
  if (Platform.OS === "ios") {
    return permission.ios?.allowsAlert === false || permission.ios?.allowsSound === false ? "off" : "ok";
  }
  const channel = await Notifications.getNotificationChannelAsync("default");
  // No channel yet just means push was never registered on this install; the
  // go-online flow creates it, so don't nag about it here.
  if (!channel) return "ok";
  return channel.importance < Notifications.AndroidImportance.HIGH || channel.sound === null ? "off" : "ok";
}

async function checkBattery(): Promise<AlertHealth["battery"]> {
  if (Platform.OS !== "android") return "ok";
  const Battery = loadBattery();
  if (!Battery?.isBatteryOptimizationEnabledAsync) return "unknown";
  try {
    return (await Battery.isBatteryOptimizationEnabledAsync()) ? "restricted" : "ok";
  } catch {
    return "unknown";
  }
}

export async function getAlertHealth(): Promise<AlertHealth> {
  if (Platform.OS === "web") return { notifications: "ok", battery: "ok" };
  const [notifications, battery] = await Promise.all([
    checkNotifications().catch(() => "ok" as const),
    checkBattery(),
  ]);
  return { notifications, battery };
}

const PACKAGE = "com.zaboni.delivery";

export async function openNotificationSettings(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
        { key: "android.provider.extra.APP_PACKAGE", value: PACKAGE },
      ]);
      return;
    } catch {
      // Fall through to the app's settings page.
    }
  }
  await Linking.openSettings();
}

/** Opens the "battery optimization" list, where the courier picks زبوني → Don't optimize. */
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
      return;
    } catch {
      // Some vendor ROMs hide this screen; the app page has a battery entry.
    }
  }
  await Linking.openSettings();
}

/** Brand-specific extra step; many Chinese ROMs kill background apps regardless. */
export function vendorBatteryTip(): string | null {
  if (Platform.OS !== "android") return null;
  const constants = Platform.constants as { Manufacturer?: string; Brand?: string };
  const maker = `${constants.Manufacturer ?? ""} ${constants.Brand ?? ""}`.toLowerCase();
  if (/xiaomi|redmi|poco/.test(maker)) {
    return "على شاومي: من معلومات التطبيق فعّل «التشغيل التلقائي» وخلّي «توفير البطارية» على «بلا قيود».";
  }
  if (/huawei|honor/.test(maker)) {
    return "على هواوي: من «تشغيل التطبيقات» خلّي زبوني «إدارة يدوية» وفعّل الخيارات التلاتة.";
  }
  if (/oppo|realme|oneplus/.test(maker)) {
    return "على أوبو/ريلمي: من معلومات التطبيق → استخدام البطارية فعّل «السماح بالنشاط في الخلفية» و«التشغيل التلقائي».";
  }
  if (/vivo|iqoo/.test(maker)) {
    return "على فيفو: من البطارية → «استهلاك الطاقة العالي في الخلفية» فعّلها لزبوني، وفعّل «التشغيل التلقائي».";
  }
  if (/samsung/.test(maker)) {
    return "على سامسونج: من البطارية → «حدود استخدام الخلفية» تأكد إن زبوني مو بـ«التطبيقات النائمة».";
  }
  if (/tecno|infinix|itel/.test(maker)) {
    return "على تكنو/إنفينكس: من «مدير الهاتف» → التشغيل التلقائي، فعّل زبوني وشيله من «تنظيف الخلفية».";
  }
  return null;
}
