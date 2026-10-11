import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";
import Text from "@/components/AppText";
import { courierPalette as colors } from "@/components/CourierUI";
import {
  getAlertHealth,
  openBatterySettings,
  openNotificationSettings,
  vendorBatteryTip,
  type AlertHealth,
} from "@/lib/alertHealth";

// When battery state can't be read (binaries before 1.0.19), the courier
// confirms by hand; ask again after a month in case they reinstalled.
const CONFIRMED_KEY = "@zaboni_courier_battery_confirmed_v1";
const CONFIRM_DAYS = 30;

/**
 * Warns a courier when their phone may not ring for new orders (notifications
 * off, or Android battery optimization delaying pushes) with one-tap fixes and
 * a test alert. Renders nothing when everything is fine.
 */
export function CourierAlertHealthCard() {
  const [health, setHealth] = useState<AlertHealth | null>(null);
  const [confirmed, setConfirmed] = useState(true);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    setHealth(await getAlertHealth());
    try {
      const at = Number(await AsyncStorage.getItem(CONFIRMED_KEY));
      setConfirmed(!!at && Date.now() - at < CONFIRM_DAYS * 86_400_000);
    } catch {
      setConfirmed(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-check when the courier comes back from the settings screen.
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  if (Platform.OS === "web" || !health) return null;
  const notifOff = health.notifications === "off";
  const batteryBad = health.battery === "restricted" || (health.battery === "unknown" && !confirmed);
  if (!notifOff && !batteryBad) return null;

  const tip = vendorBatteryTip();

  const sendTest = async () => {
    setTesting(true);
    try {
      const r = await customFetch<{ ok: boolean }>("/api/courier/test-push", { method: "POST" });
      Alert.alert(
        r.ok ? "انبعت تنبيه تجريبي" : "ما قدرنا نبعت التنبيه",
        r.ok
          ? "سكّر التطبيق أو اقفل الشاشة هلق. إذا ما وصلك الإشعار خلال دقيقة، طبّق الخطوات يلي فوق."
          : "جرّب تسكّر التطبيق وتفتحه من جديد، وتأكد إن الإشعارات مفعّلة.",
      );
    } catch (err) {
      Alert.alert("ما قدرنا نبعت التنبيه", err instanceof Error ? err.message : "جرّب بعد شوي");
    } finally {
      setTesting(false);
    }
  };

  const markDone = async () => {
    try { await AsyncStorage.setItem(CONFIRMED_KEY, String(Date.now())); } catch { /* ignore */ }
    setConfirmed(true);
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <MaterialIcons name="notifications-off" size={24} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text weight="bold" style={styles.title}>ممكن تفوتك طلبات!</Text>
          <Text style={styles.sub}>
            {notifOff
              ? "إشعارات زبوني مطفية أو بدون صوت، فما رح تنتبه للطلب والتطبيق مسكّر."
              : "نظام توفير البطارية ممكن يأخّر تنبيهات الطلبات أو يمنعها لما الشاشة مقفولة."}
          </Text>
        </View>
      </View>

      {notifOff && (
        <TouchableOpacity accessibilityRole="button" style={styles.fix} onPress={() => void openNotificationSettings()}>
          <MaterialIcons name="notifications-active" size={20} color="#fff" />
          <Text weight="bold" style={styles.fixText}>فعّل الإشعارات والصوت</Text>
        </TouchableOpacity>
      )}

      {batteryBad && (
        <>
          <TouchableOpacity accessibilityRole="button" style={styles.fix} onPress={() => void openBatterySettings()}>
            <MaterialIcons name="battery-charging-full" size={20} color="#fff" />
            <Text weight="bold" style={styles.fixText}>استثني زبوني من توفير البطارية</Text>
          </TouchableOpacity>
          <Text style={styles.step}>اختار «كل التطبيقات» ← زبوني ← «عدم التحسين» أو «بلا قيود».</Text>
          {tip && <Text style={styles.step}>{tip}</Text>}
        </>
      )}

      <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" style={styles.ghost} disabled={testing} onPress={() => void sendTest()}>
          {testing ? <ActivityIndicator color={colors.primary} /> : <Text weight="bold" style={styles.ghostText}>🔔 جرّب التنبيه</Text>}
        </TouchableOpacity>
        {!notifOff && health.battery === "unknown" && (
          <TouchableOpacity accessibilityRole="button" style={styles.ghost} onPress={() => void markDone()}>
            <Text weight="bold" style={styles.ghostText}>عملتها ✓</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF7ED",
    borderColor: "#F5C78E",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  head: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { fontSize: 16, color: colors.foreground, textAlign: "right" },
  sub: { fontSize: 13, color: colors.mutedForeground, marginTop: 2, textAlign: "right", lineHeight: 20 },
  fix: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.warning,
    borderRadius: 14,
    paddingVertical: 12,
  },
  fixText: { color: "#fff", fontSize: 14 },
  step: { fontSize: 12, color: colors.mutedForeground, textAlign: "right", lineHeight: 19 },
  row: { flexDirection: "row", gap: 8 },
  ghost: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  ghostText: { color: colors.primary, fontSize: 14 },
});
