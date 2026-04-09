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
    titleAr: "١. قبول الشروط",
    titleEn: "1. Acceptance of Terms",
    bodyAr:
      "باستخدامك لتطبيق مرسول، فأنت توافق على الالتزام بهذه الشروط. إذا كنت لا توافق على أي جزء منها، يرجى عدم استخدام التطبيق.",
    bodyEn:
      "By using the Marsool app, you agree to be bound by these terms. If you do not agree to any part of them, please do not use the app.",
  },
  {
    titleAr: "٢. وصف الخدمة",
    titleEn: "2. Service Description",
    bodyAr:
      "مرسول منصة وساطة تربط بين العملاء والمندوبين في دمشق وريفها. نحن لسنا طرفاً في عملية التوصيل بل نوفر الوسيلة التقنية لإتمامها.",
    bodyEn:
      "Marsool is a mediation platform connecting customers and couriers in Damascus and its surroundings. We are not a party to the delivery transaction; we only provide the technical means to complete it.",
  },
  {
    titleAr: "٣. التسجيل والحساب",
    titleEn: "3. Registration and Account",
    bodyAr:
      "يجب أن يكون رقم هاتفك صحيحاً وأن تكون مسؤولاً عن جميع الأنشطة التي تتم عبر حسابك. أنت توافق على عدم مشاركة بيانات دخولك مع أي شخص آخر.",
    bodyEn:
      "Your phone number must be valid and you are responsible for all activities that occur through your account. You agree not to share your login credentials with anyone else.",
  },
  {
    titleAr: "٤. الطلبات والدفع",
    titleEn: "4. Orders and Payment",
    bodyAr:
      "جميع المدفوعات تتم نقداً لدى الاستلام بالليرة السورية. يُعدّ الطلب ملزماً بمجرد قبوله من قبل المندوب.",
    bodyEn:
      "All payments are made in cash upon delivery in Syrian Pounds. An order is considered binding once accepted by the courier.",
  },
  {
    titleAr: "٥. سلوك المستخدم",
    titleEn: "5. User Conduct",
    bodyAr:
      "تلتزم باستخدام الخدمة بشكل قانوني ومحترم. يُحظر الطلب بنية الإلغاء أو مضايقة المندوبين أو استخدام التطبيق لأغراض احتيالية.",
    bodyEn:
      "You agree to use the service lawfully and respectfully. Ordering with intent to cancel, harassing couriers, or using the app for fraudulent purposes is prohibited.",
  },
  {
    titleAr: "٦. إلغاء الطلبات",
    titleEn: "6. Order Cancellation",
    bodyAr:
      "يمكنك إلغاء طلبك قبل قبوله من المندوب. بعد القبول، يُنصح بالتواصل مع المندوب مباشرةً عبر المحادثة.",
    bodyEn:
      "You can cancel your order before it is accepted by a courier. After acceptance, it is recommended to communicate directly with the courier via chat.",
  },
  {
    titleAr: "٧. حدود المسؤولية",
    titleEn: "7. Limitation of Liability",
    bodyAr:
      "لا تتحمل مرسول مسؤولية التأخير الناجم عن ظروف خارجة عن إرادتها كحوادث السير أو ظروف الطقس القاهرة.",
    bodyEn:
      "Marsool is not liable for delays caused by circumstances beyond its control such as traffic accidents or extreme weather conditions.",
  },
  {
    titleAr: "٨. التعديلات على الشروط",
    titleEn: "8. Changes to Terms",
    bodyAr:
      "نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم إشعارك بالتغييرات الجوهرية عبر التطبيق قبل نفاذها.",
    bodyEn:
      "We reserve the right to modify these terms at any time. You will be notified of material changes through the app before they take effect.",
  },
];

export default function TermsScreen() {
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
          {isAr ? "شروط الاستخدام" : "Terms of Service"}
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
            ? "تحكم هذه الشروط استخدامك لتطبيق مرسول وجميع الخدمات المرتبطة به. يرجى قراءتها بعناية قبل استخدام التطبيق."
            : "These terms govern your use of the Marsool app and all related services. Please read them carefully before using the app."}
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
          <MaterialIcons name="gavel" size={20} color={colors.primary} />
          <Text style={[styles.contactText, { color: colors.mutedForeground }]}>
            {isAr
              ? "باستمرارك في استخدام التطبيق فأنت توافق على هذه الشروط. للاستفسارات، تواصل معنا عبر قسم الدعم."
              : "By continuing to use the app you agree to these terms. For inquiries, contact us via the Support section."}
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
