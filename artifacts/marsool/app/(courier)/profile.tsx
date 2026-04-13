import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Switch,
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";
import { useCourier } from "@/context/CourierContext";
import { useRouter } from "expo-router";

const DEFAULT_ADMIN_PHONE = "+963999000111";

interface CourierStats {
  deliveredCount: number;
  avgRating: number | null;
  name: string;
  phone: string;
  role: string;
  avatarUrl?: string | null;
}

interface SubscriptionStatus {
  status: "paid" | "waived" | "pending";
  amount: number;
  date: string;
  note?: string | null;
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
  const { isOnline, isTogglingOnline, toggleAvailability } = useCourier();

  const [howItWorksVisible, setHowItWorksVisible] = useState(false);
  const [adminPhone, setAdminPhone] = useState(DEFAULT_ADMIN_PHONE);
  const [adminWhatsApp, setAdminWhatsApp] = useState(DEFAULT_ADMIN_PHONE);
  const [application, setApplication] = useState<CourierApplication | null>(null);

  const handleToggleAvailability = async () => {
    try {
      await toggleAvailability();
    } catch {
      Alert.alert("خطأ", "تعذّر تغيير حالة التوافر، تحقق من اتصالك وحاول مجدداً");
    }
  };

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
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const [statsData, subData, appData] = await Promise.all([
          customFetch("/api/courier/stats") as Promise<CourierStats>,
          customFetch("/api/courier/subscription/today") as Promise<SubscriptionStatus>,
          customFetch("/api/courier/my-application").catch(() => null) as Promise<CourierApplication | null>,
        ]);
        setStats(statsData);
        setSubscription(subData);
        setApplication(appData);
      } catch {
        setStats(null);
        setSubscription(null);
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
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <MaterialIcons name="person" size={24} color="#fff" />
        <Text style={styles.headerTitle}>{t("courier.profile.title")}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding + 24 }}>
          <View style={[styles.avatarSection, { backgroundColor: colors.primary }]}>
            <TouchableOpacity style={styles.avatarWrapper} onPress={() => router.push("/edit-profile")} activeOpacity={0.8}>
              {(user?.avatarUrl || stats?.avatarUrl) ? (
                <Image
                  source={{ uri: (() => {
                    const url = user?.avatarUrl || stats?.avatarUrl || "";
                    return url.startsWith("/") ? `/api${url}` : url;
                  })() }}
                  style={[styles.avatar, { borderRadius: 42 }]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }]}>
                  <MaterialIcons name="delivery-dining" size={48} color="#fff" />
                </View>
              )}
              <View style={styles.avatarEditOverlay}>
                <MaterialIcons name="photo-camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={styles.userNameRow}>
              <Text style={styles.userName}>{user?.name || stats?.name || t("profile.defaultUser")}</Text>
              <TouchableOpacity onPress={() => router.push("/edit-profile")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="edit" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userPhone}>{user?.phone || stats?.phone || ""}</Text>
            <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
              <MaterialIcons name="verified" size={14} color="#fff" />
              <Text style={styles.badgeText}>{t("profile.courier.badge")}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <MaterialIcons name="local-shipping" size={28} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats?.deliveredCount ?? 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                {t("courier.profile.delivered")}
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <MaterialIcons name="star" size={28} color="#FFB800" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats?.avgRating != null ? stats.avgRating.toFixed(1) : "—"}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                {t("courier.profile.avgRating")}
              </Text>
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <MaterialIcons name="phone" size={20} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  {t("courier.profile.phone")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {stats?.phone || user?.phone || "—"}
                </Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <MaterialIcons name="check-circle" size={20} color="#22c55e" />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  {t("courier.profile.accountStatus")}
                </Text>
                <Text style={[styles.infoValue, { color: "#22c55e" }]}>
                  {t("courier.profile.statusActive")}
                </Text>
              </View>
            </View>
            {application?.vehicleType && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="two-wheeler" size={20} color={colors.primary} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>نوع المركبة</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {VEHICLE_LABELS[application.vehicleType] ?? application.vehicleType}
                      {application.vehiclePlate ? `  —  ${application.vehiclePlate}` : ""}
                    </Text>
                  </View>
                </View>
              </>
            )}
            {application?.createdAt && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="calendar-today" size={20} color={colors.primary} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>عضو منذ</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {new Date(application.createdAt).toLocaleDateString("ar-SY", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          <View style={[styles.availabilityCard, {
            backgroundColor: isOnline ? "#f0fdf4" : "#fef2f2",
            borderColor: isOnline ? "#bbf7d0" : "#fecaca",
          }]}>
            <View style={styles.availabilityLeft}>
              <View style={[styles.availabilityDot, { backgroundColor: isOnline ? "#22c55e" : "#ef4444" }]} />
              <View>
                <Text style={[styles.availabilityTitle, { color: isOnline ? "#15803d" : "#dc2626" }]}>
                  {isOnline ? t("courier.available.online") : t("courier.available.offline")}
                </Text>
                <Text style={[styles.availabilitySub, { color: isOnline ? "#16a34a" : "#b91c1c" }]}>
                  {isOnline ? t("courier.available.onlineSub") : t("courier.available.offlineSub")}
                </Text>
              </View>
            </View>
            {isTogglingOnline ? (
              <ActivityIndicator size="small" color={isOnline ? "#22c55e" : "#ef4444"} />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={handleToggleAvailability}
                trackColor={{ false: "#fca5a5", true: "#86efac" }}
                thumbColor={isOnline ? "#22c55e" : "#ef4444"}
                ios_backgroundColor="#fca5a5"
              />
            )}
          </View>

          {subscription !== null && (
            <TouchableOpacity
              style={[
                styles.subscriptionCard,
                {
                  backgroundColor: subscription.status === "pending" ? "#fff7ed" : "#f0fdf4",
                  borderColor: subscription.status === "pending" ? "#fed7aa" : "#bbf7d0",
                },
              ]}
              onPress={() => router.push("/(courier)/subscription-history")}
              activeOpacity={0.8}
            >
              <View style={styles.subscriptionLeft}>
                <MaterialIcons
                  name={subscription.status === "pending" ? "warning" : "check-circle"}
                  size={22}
                  color={subscription.status === "pending" ? "#ea580c" : "#16a34a"}
                />
                <View>
                  <Text style={[
                    styles.subscriptionTitle,
                    { color: subscription.status === "pending" ? "#c2410c" : "#15803d" },
                  ]}>
                    {subscription.status === "paid"
                      ? "اشتراك اليوم مدفوع ✓"
                      : subscription.status === "waived"
                      ? "اشتراك اليوم: معفى ✓"
                      : "اشتراك اليوم غير مدفوع"}
                  </Text>
                  <Text style={[
                    styles.subscriptionSub,
                    { color: subscription.status === "pending" ? "#9a3412" : "#166534" },
                  ]}>
                    {subscription.status === "pending"
                      ? "تواصل مع الإدارة لتسوية الاشتراك"
                      : `${subscription.amount.toLocaleString("ar-SY")} ل.س`}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-left" size={20} color={subscription.status === "pending" ? "#ea580c" : "#16a34a"} />
            </TouchableOpacity>
          )}

          <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push("/(courier)/wallet")}
              activeOpacity={0.8}
            >
              <View style={[styles.menuIcon, { backgroundColor: "#fff7ed" }]}>
                <MaterialIcons name="account-balance-wallet" size={20} color="#DC2626" />
              </View>
              <Text style={[styles.menuText, { color: colors.foreground }]}>محفظتي</Text>
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push("/(courier)/earnings")}
              activeOpacity={0.8}
            >
              <View style={[styles.menuIcon, { backgroundColor: "#fef9c3" }]}>
                <MaterialIcons name="bar-chart" size={20} color="#ca8a04" />
              </View>
              <Text style={[styles.menuText, { color: colors.foreground }]}>
                {t("courier.earnings.title")}
              </Text>
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push("/(courier)/order-history")}
              activeOpacity={0.8}
            >
              <View style={[styles.menuIcon, { backgroundColor: "#eff6ff" }]}>
                <MaterialIcons name="history" size={20} color="#3b82f6" />
              </View>
              <Text style={[styles.menuText, { color: colors.foreground }]}>سجل التوصيلات</Text>
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push("/(courier)/my-ratings")}
              activeOpacity={0.8}
            >
              <View style={[styles.menuIcon, { backgroundColor: "#fefce8" }]}>
                <MaterialIcons name="star" size={20} color="#eab308" />
              </View>
              <Text style={[styles.menuText, { color: colors.foreground }]}>تقييمات الزبائن</Text>
              {stats?.avgRating != null ? (
                <View style={styles.ratingBadge}>
                  <MaterialIcons name="star" size={12} color="#FFB800" />
                  <Text style={styles.ratingBadgeText}>{stats.avgRating.toFixed(1)}</Text>
                </View>
              ) : null}
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Support */}
          <View style={[styles.menuSection, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <View style={styles.supportHeader}>
              <MaterialIcons name="support-agent" size={18} color={colors.mutedForeground} />
              <Text style={[styles.supportHeaderText, { color: colors.mutedForeground }]}>الدعم والمساعدة</Text>
            </View>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuRow} onPress={handleCallAdmin} activeOpacity={0.7}>
              <View style={[styles.menuIcon, { backgroundColor: "#fdf4ff" }]}>
                <MaterialIcons name="phone" size={20} color="#9333ea" />
              </View>
              <View style={styles.supportInfo}>
                <Text style={[styles.menuText, { color: colors.foreground }]}>اتصل بالإدارة</Text>
                <Text style={[styles.supportSub, { color: colors.mutedForeground }]}>
                  {adminPhone}
                </Text>
              </View>
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuRow} onPress={handleWhatsAppAdmin} activeOpacity={0.7}>
              <View style={[styles.menuIcon, { backgroundColor: "#f0fdf4" }]}>
                <MaterialIcons name="chat" size={20} color="#22c55e" />
              </View>
              <View style={styles.supportInfo}>
                <Text style={[styles.menuText, { color: colors.foreground }]}>واتساب الإدارة</Text>
                <Text style={[styles.supportSub, { color: colors.mutedForeground }]}>
                  للاشتراك أو حل أي مشكلة
                </Text>
              </View>
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuRow} onPress={() => setHowItWorksVisible(true)} activeOpacity={0.7}>
              <View style={[styles.menuIcon, { backgroundColor: "#fef9c3" }]}>
                <MaterialIcons name="info-outline" size={20} color="#ca8a04" />
              </View>
              <View style={styles.supportInfo}>
                <Text style={[styles.menuText, { color: colors.foreground }]}>كيف يعمل التطبيق</Text>
                <Text style={[styles.supportSub, { color: colors.mutedForeground }]}>
                  اشتراك يومي — احتفظ بكامل رسوم التوصيل
                </Text>
              </View>
              <MaterialIcons name="chevron-left" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Sign Out */}
          <TouchableOpacity
            style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: "#fecaca" }]}
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
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>كيف يعمل التطبيق</Text>
              <TouchableOpacity onPress={() => setHowItWorksVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.howItWorksContent}>
              <View style={[styles.howStep, { borderColor: colors.border }]}>
                <View style={[styles.howIcon, { backgroundColor: "#fff7ed" }]}>
                  <MaterialIcons name="credit-card" size={24} color="#DC2626" />
                </View>
                <View style={styles.howText}>
                  <Text style={[styles.howTitle, { color: colors.foreground }]}>الاشتراك اليومي</Text>
                  <Text style={[styles.howBody, { color: colors.mutedForeground }]}>
                    تدفع رسوم اشتراك يومية للمنصة. يمكنك الدفع مسبقاً عبر المحفظة أو التسوية مع الإدارة.
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

              <View style={[styles.howStep, { borderColor: colors.border }]}>
                <View style={[styles.howIcon, { backgroundColor: "#eff6ff" }]}>
                  <MaterialIcons name="account-balance-wallet" size={24} color="#3b82f6" />
                </View>
                <View style={styles.howText}>
                  <Text style={[styles.howTitle, { color: colors.foreground }]}>المحفظة</Text>
                  <Text style={[styles.howBody, { color: colors.mutedForeground }]}>
                    ادفع رصيداً في مكتب الإدارة وأودعه في محفظتك. يُستقطع منها الاشتراك اليومي تلقائياً.
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
            </View>

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 8,
  },
  avatarWrapper: {
    position: "relative",
    marginBottom: 4,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarEditOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  userName: { fontSize: 20, fontWeight: "800", color: "#fff" },
  userPhone: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 4,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    margin: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 12, textAlign: "center" },
  infoCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, fontWeight: "600" },
  divider: { height: 1, marginHorizontal: 16 },
  availabilityCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  availabilityLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  availabilityDot: { width: 10, height: 10, borderRadius: 5 },
  availabilityTitle: { fontSize: 15, fontWeight: "700" },
  availabilitySub: { fontSize: 12, marginTop: 2 },
  menuSection: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: { flex: 1, fontSize: 15, fontWeight: "600" },
  menuDivider: { height: 1, marginHorizontal: 14 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#fef9c3",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ratingBadgeText: { fontSize: 12, fontWeight: "700", color: "#ca8a04" },
  supportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  supportHeaderText: { fontSize: 13, fontWeight: "600" },
  supportInfo: { flex: 1, gap: 2 },
  supportSub: { fontSize: 12 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  signOutText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  subscriptionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  subscriptionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  subscriptionTitle: { fontSize: 15, fontWeight: "700" },
  subscriptionSub: { fontSize: 12, marginTop: 2 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
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
  modalTitle: { fontSize: 18, fontWeight: "800" },
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
