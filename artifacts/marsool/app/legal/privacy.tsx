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

const LAST_UPDATED_AR = "١ يناير ٢٠٢٥";
const LAST_UPDATED_EN = "January 1, 2025";

interface Section {
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}

const SECTIONS: Section[] = [
  {
    titleAr: "١. المعلومات التي نجمعها",
    titleEn: "1. Information We Collect",
    bodyAr:
      "نجمع المعلومات التي تزودنا بها عند التسجيل مثل رقم هاتفك واسمك. كما نجمع بيانات الموقع الجغرافي لتحديد عنوان التوصيل، وبيانات الاستخدام كالطلبات والعناوين وتاريخ المعاملات.",
    bodyEn:
      "We collect information you provide when registering, such as your phone number and name. We also collect location data to determine your delivery address, and usage data like orders, addresses, and transaction history.",
  },
  {
    titleAr: "٢. كيف نستخدم معلوماتك",
    titleEn: "2. How We Use Your Information",
    bodyAr:
      "نستخدم معلوماتك لتقديم الخدمة، ومعالجة الطلبات، وإبلاغك بتحديثات التوصيل، وتحسين تجربة التطبيق.",
    bodyEn:
      "We use your information to provide the service, process orders, notify you of delivery updates, and improve the app experience.",
  },
  {
    titleAr: "٣. مشاركة المعلومات",
    titleEn: "3. Information Sharing",
    bodyAr:
      "لا نبيع معلوماتك الشخصية. نشارك البيانات الضرورية فقط مع المندوبين لإتمام عمليات التوصيل.",
    bodyEn:
      "We do not sell your personal information. We only share necessary data with couriers to complete deliveries.",
  },
  {
    titleAr: "٤. أمان البيانات",
    titleEn: "4. Data Security",
    bodyAr:
      "نطبّق معايير أمان صارمة لحماية بياناتك. يتم تشفير جميع الاتصالات عبر بروتوكول HTTPS.",
    bodyEn:
      "We apply strict security standards to protect your data. All communications are encrypted via HTTPS.",
  },
  {
    titleAr: "٥. حقوقك",
    titleEn: "5. Your Rights",
    bodyAr:
      "يحق لك طلب الاطلاع على بياناتك أو تعديلها أو حذفها. يمكنك التواصل معنا عبر قسم الدعم في التطبيق.",
    bodyEn:
      "You have the right to request access to, correction of, or deletion of your data. Contact us via the support section in the app.",
  },
  {
    titleAr: "٦. ملفات تعريف الارتباط",
    titleEn: "6. Cookies",
    bodyAr:
      "يستخدم التطبيق تخزيناً محلياً للحفاظ على جلستك وتذكّر تفضيلاتك. لا نستخدم ملفات تعريف ارتباط إعلانية.",
    bodyEn:
      "The app uses local storage to maintain your session and remember your preferences. We do not use advertising cookies.",
  },
  {
    titleAr: "٧. التعديلات على هذه السياسة",
    titleEn: "7. Changes to This Policy",
    bodyAr:
      "قد نُحدّث هذه السياسة من وقت لآخر. سنُخطرك بأي تغييرات جوهرية عبر التطبيق.",
    bodyEn:
      "We may update this policy from time to time. We will notify you of any material changes through the app.",
  },
];

export default function PrivacyScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const backIcon = useBackIcon();
  const isAr = i18n.language === "ar";

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: bottomPadding + 32, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.updateBadge, { backgroundColor: colors.secondary }]}>
          <MaterialIcons name="update" size={14} color={colors.primary} />
          <Text style={[styles.updateText, { color: colors.mutedForeground }]}>
            {isAr ? `آخر تحديث: ${LAST_UPDATED_AR}` : `Last updated: ${LAST_UPDATED_EN}`}
          </Text>
        </View>

        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          {isAr
            ? "تصف هذه السياسة كيفية جمع معلوماتك واستخدامها وحمايتها عند استخدامك لتطبيق زبوني."
            : "This policy describes how your information is collected, used, and protected when you use the Zaboni app."}
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.titleAr} style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isAr ? section.titleAr : section.titleEn}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>
              {isAr ? section.bodyAr : section.bodyEn}
            </Text>
          </View>
        ))}

        <View style={[styles.contactBox, { backgroundColor: colors.secondary, borderColor: colors.primary + "30" }]}>
          <MaterialIcons name="mail-outline" size={20} color={colors.primary} />
          <Text style={[styles.contactText, { color: colors.mutedForeground }]}>
            {isAr
              ? "للاستفسارات المتعلقة بالخصوصية، تواصل معنا عبر قسم الدعم داخل التطبيق."
              : "For privacy inquiries, contact us via the Support section inside the app."}
          </Text>
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
  updateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  updateText: { fontSize: 12, fontWeight: "500" },
  intro: { fontSize: 14, lineHeight: 22 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  sectionBody: { fontSize: 13, lineHeight: 21 },
  contactBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  contactText: { flex: 1, fontSize: 13, lineHeight: 21 },
});
