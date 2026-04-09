import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";

const APP_VERSION = "1.0.0";
const BUILD_NUMBER = "100";

export default function AboutScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("about.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 32, paddingBottom: bottomPadding + 24, gap: 20, alignItems: "center" }}>
        <View style={[styles.logoCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.logoChar}>م</Text>
        </View>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={[styles.appName, { color: colors.foreground }]}>{t("app.name")}</Text>
          <Text style={[styles.appTagline, { color: colors.mutedForeground }]}>{t("about.tagline")}</Text>
          <View style={[styles.versionBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.versionText, { color: colors.primary }]}>
              {t("about.version", { version: APP_VERSION, build: BUILD_NUMBER })}
            </Text>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, alignSelf: "stretch" }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>{t("about.description.title")}</Text>
          <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>{t("about.description.body")}</Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, alignSelf: "stretch" }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>{t("about.features.title")}</Text>
          {(t("about.features.items", { returnObjects: true }) as string[]).map((item, i) => (
            <View key={i} style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={16} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.foreground }]}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.linksCard, { backgroundColor: colors.card, borderColor: colors.border, alignSelf: "stretch" }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>{t("about.legal.title")}</Text>
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/privacy")} activeOpacity={0.7}>
            <MaterialIcons name="privacy-tip" size={18} color={colors.primary} />
            <Text style={[styles.linkText, { color: colors.primary }]}>{t("about.legal.privacy")}</Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push("/terms")} activeOpacity={0.7}>
            <MaterialIcons name="description" size={18} color={colors.primary} />
            <Text style={[styles.linkText, { color: colors.primary }]}>{t("about.legal.terms")}</Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.copyright, { color: colors.mutedForeground }]}>
          {t("about.copyright")}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
  logoCard: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  logoChar: { fontSize: 48, fontWeight: "800", color: "#fff" },
  appName: { fontSize: 26, fontWeight: "800" },
  appTagline: { fontSize: 14, textAlign: "center" },
  versionBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
  versionText: { fontSize: 13, fontWeight: "600" },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  infoTitle: { fontSize: 15, fontWeight: "800" },
  infoBody: { fontSize: 13, lineHeight: 20 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13, flex: 1 },
  linksCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  linkText: { flex: 1, fontSize: 14, fontWeight: "600" },
  divider: { height: 1 },
  copyright: { fontSize: 12, textAlign: "center", paddingTop: 8 },
});
