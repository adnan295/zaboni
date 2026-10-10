import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  Alert,
  Linking,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useCourierColors as useColors, CourierHeader } from "@/components/CourierUI";
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";
import { buildAvatarUrl } from "@/lib/apiConfig";
import { useFocusEffect, useRouter } from "expo-router";
import { formatDate } from "@/utils/date";

const DEFAULT_ADMIN_PHONE = "+963999000111";

interface CourierStats {
  deliveredCount: number;
  avgRating: number | null;
  name: string;
  phone: string;
  role: string;
  avatarUrl?: string | null;
}

interface ContactConfig {
  phone: string;
  whatsapp: string;
}

interface CourierApplication {
  id: string;
  status: string;
  vehicleType: "motorcycle" | "car" | "bicycle";
  vehiclePlate: string;
  fullName: string;
  createdAt: string;
}

const VEHICLE_LABELS: Record<string, string> = {
  motorcycle: "دراجة نارية",
  car: "سيارة",
  bicycle: "دراجة هوائية",
};

export default function CourierProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  const [howItWorksVisible, setHowItWorksVisible] = useState(false);
  const [adminPhone, setAdminPhone] = useState(DEFAULT_ADMIN_PHONE);
  const [adminWhatsApp, setAdminWhatsApp] = useState(DEFAULT_ADMIN_PHONE);
  const [application, setApplication] = useState<CourierApplication | null>(null);

  const handleSignOut = () => {
    Alert.alert("تسجيل الخروج", "هل أنت متأكد من تسجيل الخروج؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: async () => { await signOut(); },
      },
    ]);
  };

  const handleCallAdmin = () => {
    Linking.openURL(`tel:${adminPhone}`);
  };

  const handleWhatsAppAdmin = () => {
    const cleaned = adminWhatsApp.replace(/\+/g, "");
    Linking.openURL(`https://wa.me/${cleaned}`);
  };

  const [stats, setStats] = useState<CourierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const [subscription, setSubscription] = useState<{ isActive: boolean; subscription: { endsAt: string } | null; daysLeft?: number } | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(false);
  useFocusEffect(useCallback(() => {
    let mounted = true;
    setSubscriptionLoading(true);
    setSubscriptionError(false);
    customFetch("/api/courier/subscription/status")
      .then((data) => { if (mounted) setSubscription(data as typeof subscription); })
      .catch(() => { if (mounted) setSubscriptionError(true); })
      .finally(() => { if (mounted) setSubscriptionLoading(false); });
    return () => { mounted = false; };
  }, []));

  const menuItem = (label: string, icon: React.ComponentProps<typeof MaterialIcons>["name"], onPress: () => void, detail?: string) => (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={styles.menuRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.menuIcon, { backgroundColor: "#FCECEF" }]}><MaterialIcons name={icon} size={22} color={colors.primary} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", textAlign: "right" }}>{label}</Text>
        {detail ? <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "right" }}>{detail}</Text> : null}
      </View>
      <MaterialIcons name="chevron-left" size={22} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
  const sectionTitle = (title: string) => <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>;

  useEffect(() => {
    (async () => {
      try {
        const [statsData, appData] = await Promise.all([
          customFetch("/api/courier/stats") as Promise<CourierStats>,
          customFetch("/api/courier/my-application").catch(() => null) as Promise<CourierApplication | null>,
        ]);
        setStats(statsData);
        setApplication(appData);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const config = await customFetch("/api/config/contact") as ContactConfig;
        if (config?.phone) setAdminPhone(config.phone);
        if (config?.whatsapp) setAdminWhatsApp(config.whatsapp);
      } catch {
      }
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CourierHeader title="حسابي" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding + 24 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="تعديل الحساب" onPress={() => router.push("/edit-profile")} style={[styles.identity, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(user?.avatarUrl || stats?.avatarUrl) ? (
              <Image source={{ uri: buildAvatarUrl(user?.avatarUrl || stats?.avatarUrl) }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "#FCECEF", alignItems: "center", justifyContent: "center" }]}><MaterialIcons name="delivery-dining" size={30} color={colors.primary} /></View>
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: "right" }}>{user?.name || stats?.name || t("profile.defaultUser")}</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "right" }}>{user?.phone || stats?.phone || ""}</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, textAlign: "right" }}>تعديل الحساب والصورة</Text>
            </View>
            <MaterialIcons name="chevron-left" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.subscriptionCard, { backgroundColor: "#FCECEF", borderColor: "#F3CCD1" }]}>
            <View style={styles.subscriptionHeading}>
              <MaterialIcons name="card-membership" size={24} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", color: colors.foreground, textAlign: "right" }}>اشتراكي</Text>
            </View>
            {subscriptionLoading ? <ActivityIndicator color={colors.primary} /> : (
              <Text style={{ fontSize: 14, color: colors.foreground, textAlign: "right" }}>
                {subscriptionError ? "تعذّر تحميل حالة الاشتراك. افتح اشتراكاتي للتحقق." : subscription?.isActive ? `اشتراك فعّال${subscription.subscription?.endsAt ? ` • ينتهي ${formatDate(subscription.subscription.endsAt)}` : ""}` : "لا يوجد اشتراك فعّال حالياً"}
              </Text>
            )}
            <View style={styles.subscriptionLinks}>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.push("/(courier)/subscription-history")} style={styles.textButton}><Text style={styles.textButtonLabel}>اشتراكاتي</Text></TouchableOpacity>
            </View>
          </View>

          {sectionTitle("نشاطي ومكافآتي")}
          <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {menuItem("سجل التوصيلات", "history", () => router.push("/(courier)/order-history"), stats ? `${stats.deliveredCount} توصيل مكتمل` : undefined)}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            {menuItem("نقاطي ومكافآتي", "stars", () => router.push("/(courier)/points"), "استبدل نقاطك بأيام اشتراك")}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            {menuItem("تقييمات الزبائن", "star-outline", () => router.push("/(courier)/my-ratings"), stats?.avgRating != null ? `تقييمك ${stats.avgRating.toFixed(1)} من 5` : undefined)}
          </View>

          {sectionTitle("تحتاج مساعدة؟")}
          <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {menuItem("اتصل بالدعم", "support-agent", handleCallAdmin)}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            {menuItem("واتساب الدعم", "chat", handleWhatsAppAdmin)}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            {menuItem("كيف يعمل التطبيق", "help-outline", () => setHowItWorksVisible(true))}
          </View>

          {application && (application.vehicleType || application.createdAt) ? <>
            {sectionTitle("بيانات السائق")}
            <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {application.vehicleType ? <View style={styles.infoRow}>
                <MaterialIcons name="two-wheeler" size={22} color={colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground, textAlign: "right" }]}>المركبة</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground, textAlign: "right" }]}>{VEHICLE_LABELS[application.vehicleType] ?? application.vehicleType}{application.vehiclePlate ? ` — ${application.vehiclePlate}` : ""}</Text>
                </View>
              </View> : null}
              {application.createdAt ? <Text style={{ padding: 14, color: colors.mutedForeground, fontSize: 12, textAlign: "right" }}>عضو منذ {formatDate(application.createdAt)}</Text> : null}
            </View>
          </> : null}

          {/* Sign Out */}
          <TouchableOpacity
            style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: "#fecaca" }]}
            accessibilityRole="button"
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <MaterialIcons name="logout" size={20} color="#ef4444" />
            <Text style={styles.signOutText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* How It Works Modal */}
      <Modal
        visible={howItWorksVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHowItWorksVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>كيف يعمل التطبيق</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="إغلاق الشرح" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }} onPress={() => setHowItWorksVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.howItWorksContent}>
              <View style={[styles.howStep, { borderColor: colors.border }]}>
                <View style={[styles.howIcon, { backgroundColor: "#fff7ed" }]}>
                  <MaterialIcons name="credit-card" size={24} color="#DC2626" />
                </View>
                <View style={styles.howText}>
                  <Text style={[styles.howTitle, { color: colors.foreground }]}>باقة الاشتراك</Text>
                  <Text style={[styles.howBody, { color: colors.mutedForeground }]}>
                    اختر باقة اشتراك من صفحة "الباقات"، حوّل المبلغ خارجياً وارفع صورة وصل الدفع لتتم مراجعته من الإدارة.
                  </Text>
                </View>
              </View>

              <View style={[styles.howStep, { borderColor: colors.border }]}>
                <View style={[styles.howIcon, { backgroundColor: "#f0fdf4" }]}>
                  <MaterialIcons name="account-balance-wallet" size={24} color="#22c55e" />
                </View>
                <View style={styles.howText}>
                  <Text style={[styles.howTitle, { color: colors.foreground }]}>رسوم التوصيل</Text>
                  <Text style={[styles.howBody, { color: colors.mutedForeground }]}>
                    تستلم رسوم التوصيل كاملةً نقداً من الزبون. 100% من رسوم التوصيل تذهب إليك مباشرةً.
                  </Text>
                </View>
              </View>

              <View style={[styles.howStep, { borderColor: colors.border, borderBottomWidth: 0 }]}>
                <View style={[styles.howIcon, { backgroundColor: "#fefce8" }]}>
                  <MaterialIcons name="delivery-dining" size={24} color="#eab308" />
                </View>
                <View style={styles.howText}>
                  <Text style={[styles.howTitle, { color: colors.foreground }]}>سير الطلب</Text>
                  <Text style={[styles.howBody, { color: colors.mutedForeground }]}>
                    فعّل وضع "متاح" لتستقبل الطلبات → اقبل الطلب → استلم → أوصّل → قيّم الزبون.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
              onPress={() => setHowItWorksVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>فهمت، شكراً!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  identity: { margin: 16, marginBottom: 12, padding: 14, borderRadius: 18, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  subscriptionCard: { marginHorizontal: 16, padding: 14, borderWidth: 1, borderRadius: 18, gap: 12 },
  subscriptionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  primaryButton: { minHeight: 46, padding: 12, borderRadius: 12, justifyContent: "center" },
  subscriptionLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  textButton: { flexGrow: 1, flexBasis: 120, minHeight: 44, padding: 8, borderRadius: 10, backgroundColor: "#fff", justifyContent: "center" },
  textButtonLabel: { color: "#C92535", fontSize: 13, fontWeight: "700", textAlign: "center" },
  sectionTitle: { marginHorizontal: 20, marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: "700", textAlign: "right" },
  menuSection: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minHeight: 62 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuDivider: { height: 1, marginHorizontal: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  infoContent: { flex: 1, minWidth: 0, gap: 4 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, fontWeight: "600" },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, margin: 16, borderRadius: 14, borderWidth: 1, padding: 14 },
  signOutText: { fontSize: 15, fontWeight: "700", color: "#C92535", flexShrink: 1 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { flex: 1, flexShrink: 1, fontSize: 18, fontWeight: "800" },
  howItWorksContent: { gap: 0 },
  howStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  howIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  howText: { flex: 1, gap: 4 },
  howTitle: { fontSize: 15, fontWeight: "700" },
  howBody: { fontSize: 13, lineHeight: 20 },
  modalCloseBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  modalCloseBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
