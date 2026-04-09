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

const STEP_ICONS: Array<keyof typeof MaterialIcons.glyphMap> = [
  "edit-note",
  "delivery-dining",
  "payments",
];

export default function PaymentInfoScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backIcon = useBackIcon();
  const { t } = useTranslation();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const steps = t("paymentInfo.steps", { returnObjects: true }) as { title: string; desc: string }[];
  const tips = t("paymentInfo.tips", { returnObjects: true }) as string[];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("paymentInfo.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 32 }]}>
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="payments" size={56} color="#fff" />
          <Text style={styles.heroTitle}>{t("paymentInfo.heroTitle")}</Text>
          <Text style={styles.heroSub}>{t("paymentInfo.heroSub")}</Text>
        </View>

        <View style={[styles.infoBanner, { backgroundColor: "#fffbeb", borderColor: "#fcd34d" }]}>
          <MaterialIcons name="info-outline" size={18} color="#d97706" />
          <Text style={[styles.infoBannerText, { color: "#92400e" }]}>
            {t("paymentInfo.infoBanner")}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("paymentInfo.howTitle")}</Text>

        {steps.map((step, idx) => (
          <View key={idx} style={[styles.stepCard, { backgroundColor: colors.card }]}>
            <View style={[styles.stepIconBg, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name={STEP_ICONS[idx] ?? "info"} size={24} color={colors.primary} />
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
              <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>{step.desc}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.tipsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tipsTitle, { color: colors.foreground }]}>{t("paymentInfo.tipsTitle")}</Text>
          {tips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={[styles.tipBullet, { backgroundColor: colors.primary }]} />
              <Text style={[styles.tipText, { color: colors.mutedForeground }]}>{tip}</Text>
            </View>
          ))}
        </View>
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
  content: { padding: 16, gap: 16 },
  heroCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 10,
  },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, textAlign: "center" },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBannerText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  stepIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 15, fontWeight: "700" },
  stepDesc: { fontSize: 13, lineHeight: 20 },
  tipsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  tipsTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 20 },
});
