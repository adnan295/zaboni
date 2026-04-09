import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";

const WHATSAPP_NUMBER = "+963912345678";
const SUPPORT_EMAIL = "support@marsool.sy";
const SUPPORT_HOURS_START = "9:00";
const SUPPORT_HOURS_END = "22:00";

export default function SupportScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleWhatsApp = () => {
    const cleaned = WHATSAPP_NUMBER.replace(/\D/g, "");
    Linking.openURL(`https://wa.me/${cleaned}`).catch(() => {});
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  };

  const handlePhone = () => {
    Linking.openURL(`tel:${WHATSAPP_NUMBER}`).catch(() => {});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("support.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: bottomPadding + 24, gap: 16 }}>
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="support-agent" size={52} color="#fff" />
          <Text style={styles.heroTitle}>{t("support.hero.title")}</Text>
          <Text style={styles.heroSub}>{t("support.hero.sub")}</Text>
        </View>

        <View style={[styles.hoursCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialIcons name="access-time" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.hoursTitle, { color: colors.foreground }]}>{t("support.hours.title")}</Text>
            <Text style={[styles.hoursValue, { color: colors.mutedForeground }]}>
              {t("support.hours.value", { start: SUPPORT_HOURS_START, end: SUPPORT_HOURS_END })}
            </Text>
          </View>
        </View>

        <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("support.contact.title")}</Text>

          <TouchableOpacity style={[styles.contactRow, { borderColor: colors.border }]} onPress={handleWhatsApp} activeOpacity={0.7}>
            <View style={[styles.contactIcon, { backgroundColor: "#25D36622" }]}>
              <MaterialIcons name="chat" size={22} color="#25D366" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactLabel, { color: colors.mutedForeground }]}>{t("support.contact.whatsapp")}</Text>
              <Text style={[styles.contactValue, { color: colors.foreground }]}>{WHATSAPP_NUMBER}</Text>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={[styles.contactRow, { borderColor: colors.border }]} onPress={handleEmail} activeOpacity={0.7}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primary + "22" }]}>
              <MaterialIcons name="email" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactLabel, { color: colors.mutedForeground }]}>{t("support.contact.email")}</Text>
              <Text style={[styles.contactValue, { color: colors.foreground }]}>{SUPPORT_EMAIL}</Text>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={[styles.contactRow, { borderColor: colors.border }]} onPress={handlePhone} activeOpacity={0.7}>
            <View style={[styles.contactIcon, { backgroundColor: "#2563eb22" }]}>
              <MaterialIcons name="phone" size={22} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactLabel, { color: colors.mutedForeground }]}>{t("support.contact.phone")}</Text>
              <Text style={[styles.contactValue, { color: colors.foreground }]}>{WHATSAPP_NUMBER}</Text>
            </View>
            <MaterialIcons name="open-in-new" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("support.faq.title")}</Text>
          {(t("support.faq.items", { returnObjects: true }) as { q: string; a: string }[]).map((item, i) => (
            <View key={i} style={{ gap: 4 }}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <Text style={[styles.faqQ, { color: colors.foreground }]}>{item.q}</Text>
              <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{item.a}</Text>
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
  heroCard: {
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: "#fff", textAlign: "center" },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 20 },
  hoursCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hoursTitle: { fontSize: 14, fontWeight: "700" },
  hoursValue: { fontSize: 13, marginTop: 2 },
  contactCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contactLabel: { fontSize: 12, marginBottom: 2 },
  contactValue: { fontSize: 14, fontWeight: "600" },
  divider: { height: 1, marginVertical: 4 },
  faqCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  faqQ: { fontSize: 14, fontWeight: "700" },
  faqA: { fontSize: 13, lineHeight: 18 },
});
