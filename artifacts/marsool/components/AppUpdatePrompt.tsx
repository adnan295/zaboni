import React, { useEffect, useState } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { default as Text } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { APP_VERSION, getApiBaseUrl } from "@/lib/apiConfig";

const STORE_URL = Platform.OS === "ios"
  ? "https://apps.apple.com/app/zaboni/id6763415681"
  : "https://play.google.com/store/apps/details?id=com.zaboni.delivery";
const DISMISSED_KEY = "zaboni.updatePrompt.dismissed";

/** -1, 0, 1 by number ("1.0.9" < "1.0.23"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function openStore() {
  const native = Platform.OS === "android" ? "market://details?id=com.zaboni.delivery" : STORE_URL;
  Linking.openURL(native).catch(() => Linking.openURL(STORE_URL).catch(() => {}));
}

/**
 * Updating without nagging (admin dashboard, api-server lib/appVersion):
 *  • a newer version in the stores → a small card once per version; «بعدين» closes it for good.
 *  • below the minimum (only switched on for an emergency) → a page that stays until updated.
 */
export default function AppUpdatePrompt() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"none" | "suggest" | "required">("none");
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/config/app`);
        if (!res.ok) return;
        const cfg = (await res.json()) as { minAppVersion?: string | null; latestAppVersion?: string | null };
        if (cancelled) return;
        if (cfg.minAppVersion && compareVersions(APP_VERSION, cfg.minAppVersion) < 0) {
          setMode("required");
          return;
        }
        if (cfg.latestAppVersion && compareVersions(APP_VERSION, cfg.latestAppVersion) < 0) {
          const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null);
          if (!cancelled && dismissed !== cfg.latestAppVersion) {
            setLatest(cfg.latestAppVersion);
            setMode("suggest");
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  if (mode === "none") return null;

  if (mode === "required") {
    return (
      <Modal visible animationType="fade" onRequestClose={() => {}}>
        <View style={[styles.full, { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="system-update" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.bigTitle, { color: colors.foreground }]}>في تحديث مهم لزبوني</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            النسخة يلي عندك صارت قديمة. حدّثها من المتجر، بتاخد دقيقة، وبترجع تطلب عادي.
          </Text>
          <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={openStore}>
            <Text style={styles.primaryText}>حدّث هلق</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const close = () => {
    if (latest) void AsyncStorage.setItem(DISMISSED_KEY, latest).catch(() => {});
    setMode("none");
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.dim} onPress={close} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.grip, { backgroundColor: colors.border }]} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.smallIcon, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="auto-awesome" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>في نسخة جديدة من زبوني ✨</Text>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "left" }}>
              تتبّع أوضح لطلبك ومحادثة مع المندوب. حدّث من المتجر.
            </Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={() => { close(); openStore(); }}>
          <Text style={styles.primaryText}>حدّث</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={close} style={{ alignSelf: "center", padding: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.mutedForeground }}>بعدين</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, alignItems: "center", paddingHorizontal: 24, gap: 16 },
  icon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  bigTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 24, textAlign: "center" },
  primary: { alignSelf: "stretch", height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  dim: { flex: 1, backgroundColor: "rgba(17,24,39,0.45)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  grip: { width: 40, height: 5, borderRadius: 999, alignSelf: "center" },
  smallIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", textAlign: "left" },
});
