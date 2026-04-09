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
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";

const STEPS: { icon: keyof typeof MaterialIcons.glyphMap; title: string; desc: string }[] = [
  {
    icon: "edit-note",
    title: "أرسل طلبك",
    desc: "اكتب ما تريد طلبه من المطعم، وأضف عنوان التوصيل.",
  },
  {
    icon: "delivery-dining",
    title: "المندوب يستلم ويوصّل",
    desc: "يستلم المندوب طلبك من المطعم ويتوجه إليك مباشرة.",
  },
  {
    icon: "payments",
    title: "ادفع نقداً عند الاستلام",
    desc: "لا تحتاج لبطاقة بنكية. فقط أعدّ المبلغ نقداً وسلّمه للمندوب لحظة التسليم.",
  },
];

export default function PaymentInfoScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backIcon = useBackIcon();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>طرق الدفع</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 32 }]}>
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="payments" size={56} color="#fff" />
          <Text style={styles.heroTitle}>الدفع نقداً عند الاستلام</Text>
          <Text style={styles.heroSub}>الطريقة الوحيدة للدفع في مرسول حالياً</Text>
        </View>

        <View style={[styles.infoBanner, { backgroundColor: "#fffbeb", borderColor: "#fcd34d" }]}>
          <MaterialIcons name="info-outline" size={18} color="#d97706" />
          <Text style={[styles.infoBannerText, { color: "#92400e" }]}>
            لا يُقبل دفع إلكتروني أو بطاقة ائتمانية في الوقت الحالي.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>كيف يعمل الدفع؟</Text>

        {STEPS.map((step, idx) => (
          <View key={idx} style={[styles.stepCard, { backgroundColor: colors.card }]}>
            <View style={[styles.stepIconBg, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name={step.icon} size={24} color={colors.primary} />
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
              <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>{step.desc}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.tipsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tipsTitle, { color: colors.foreground }]}>نصائح مفيدة</Text>
          {[
            "أعدّ المبلغ بالضبط مسبقاً لتسريع عملية التسليم.",
            "تأكد من إدخال عنوانك بدقة لضمان وصول المندوب.",
            "يمكنك التواصل مع المندوب عبر الدردشة داخل التطبيق.",
          ].map((tip, i) => (
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
