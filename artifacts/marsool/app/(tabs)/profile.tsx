import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useOrders } from "@/context/OrderContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useNotifications } from "@/context/NotificationsContext";
import { useRatings } from "@/context/RatingsContext";
import { useLanguage, AppLanguage } from "@/context/LanguageContext";
import { customFetch } from "@workspace/api-client-react";

interface MenuItemDef {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number;
  danger?: boolean;
}

type AppStatus = "none" | "pending" | "approved" | "rejected";

interface CourierApplication {
  id: string;
  status: AppStatus;
  adminNote: string;
}

interface CustomerStats {
  totalOrders: number;
  completedOrders: number;
  totalDeliveryFees: number;
  memberSince: string | null;
}

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut, isCourier, isCourierMode, setCourierMode, refreshRole, updateName } = useAuth();
  const { orders } = useOrders();
  const { favorites } = useFavorites();
  const { unreadCount } = useNotifications();
  const { ratings } = useRatings();
  const { language, setLanguage } = useLanguage();

  const [application, setApplication] = useState<CourierApplication | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const avgRating =
    ratings.length > 0
      ? (
          ratings.reduce(
            (sum, r) => sum + (r.restaurantStars + r.courierStars) / 2,
            0
          ) / ratings.length
        ).toFixed(1)
      : "—";
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const displayPhone = user?.phone ?? "";

  const fetchApplication = useCallback(async () => {
    if (isCourier || !user) return;
    setAppLoading(true);
    try {
      const data = await customFetch("/api/courier/my-application");
      const app = data as CourierApplication | null;
      setApplication(app);
      if (app?.status === "approved") {
        await refreshRole();
        await setCourierMode(true);
      }
    } catch {
      setApplication(null);
    } finally {
      setAppLoading(false);
    }
  }, [isCourier, user?.id]);

  const fetchCustomerStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const data = await customFetch("/api/me/stats") as CustomerStats;
      setCustomerStats(data);
    } catch {
      setCustomerStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchApplication();
      fetchCustomerStats();
    }, [fetchApplication, fetchCustomerStats])
  );

  const handleSignOut = () => {
    Alert.alert(t("profile.signOutTitle"), t("profile.signOutMessage"), [
      { text: t("profile.signOutCancel"), style: "cancel" },
      {
        text: t("profile.signOutConfirm"),
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await signOut();
        },
      },
    ]);
  };

  const handleLanguage = () => {
    const otherLang: AppLanguage = language === "ar" ? "en" : "ar";
    setLanguage(otherLang);
  };

  const openEditName = () => {
    setEditNameValue(user?.name || "");
    setEditNameVisible(true);
  };

  const handleSaveName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const updated = await customFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      }) as { name: string };
      updateName(updated.name ?? trimmed);
      setEditNameVisible(false);
    } catch {
      Alert.alert("خطأ", "تعذّر حفظ الاسم، حاول مجدداً");
    } finally {
      setSavingName(false);
    }
  };

  const formatDate = (isoDate: string | null) => {
    if (!isoDate) return "—";
    return new Date(isoDate).toLocaleDateString("ar-SY", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const menuItems: MenuItemDef[] = [
    { icon: "receipt-long", label: t("profile.menu.orders"), onPress: () => router.push("/orders"), badge: orders.length > 0 ? orders.length : undefined },
    { icon: "favorite", label: t("profile.menu.favorites"), onPress: () => router.push("/favorites"), badge: favorites.length > 0 ? favorites.length : undefined },
    { icon: "location-on", label: t("profile.menu.addresses"), onPress: () => router.push("/addresses") },
    { icon: "notifications", label: t("profile.menu.notifications"), onPress: () => router.push("/notifications"), badge: unreadCount > 0 ? unreadCount : undefined },
    { icon: "payment", label: t("profile.menu.payments"), onPress: () => router.push("/payment-info") },
    { icon: "help-outline", label: t("profile.menu.support"), onPress: () => router.push("/support") },
    { icon: "info-outline", label: t("profile.menu.about"), onPress: () => router.push("/about") },
    { icon: "translate", label: t("profile.menu.language"), onPress: handleLanguage },
  ];

  const appStatus: AppStatus = isCourier ? "approved" : (application?.status ?? "none");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity style={styles.avatarContainer} onPress={() => router.push("/edit-profile")} activeOpacity={0.8}>
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl.startsWith("/") ? `/api${user.avatarUrl}` : user.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {user?.name ? user.name.charAt(0) : "؟"}
              </Text>
            </View>
          )}
          <View style={styles.editAvatarOverlay}>
            <MaterialIcons name="photo-camera" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user?.name ?? t("profile.defaultUser")}</Text>
          <TouchableOpacity onPress={() => router.push("/edit-profile")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="edit" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.phone}>{displayPhone}</Text>
        {isCourier && (
          <View style={styles.courierBadge}>
            <MaterialIcons name="verified" size={14} color="#DC2626" />
            <Text style={styles.courierBadgeText}>{t("profile.courier.badge")}</Text>
            {isCourierMode && (
              <View style={[styles.modeDot, { backgroundColor: "#4CAF50" }]} />
            )}
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {statsLoading ? "..." : (customerStats?.totalOrders ?? orders.length)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.orders")}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {statsLoading ? "..." : (customerStats?.completedOrders ?? favorites.length)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>مكتملة</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{favorites.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.favorites")}</Text>
          </View>
        </View>

        {/* Customer info card */}
        {customerStats !== null && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <MaterialIcons name="account-balance-wallet" size={18} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>إجمالي رسوم التوصيل المدفوعة</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {customerStats.totalDeliveryFees.toLocaleString("ar-SY")} ل.س
                </Text>
              </View>
            </View>
            {customerStats.memberSince && (
              <>
                <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="calendar-today" size={18} color={colors.primary} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>عضو منذ</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {formatDate(customerStats.memberSince)}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* Language chip */}
        <View style={[styles.langChip, { backgroundColor: colors.secondary }]}>
          <MaterialIcons name="language" size={16} color={colors.primary} />
          <Text style={[styles.langChipText, { color: colors.primary }]}>
            {t("profile.language.currentLabel")}
          </Text>
          <TouchableOpacity onPress={handleLanguage} style={[styles.langToggleBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.langToggleBtnText}>
              {t("profile.language.switchLabel")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Courier section */}
        {appLoading ? (
          <View style={[styles.courierCard, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : appStatus === "approved" ? (
          <View style={[styles.courierCard, { backgroundColor: "#F0FFF4", borderColor: "#B0E8C0" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="verified" size={28} color="#4CAF50" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#2E7D32" }]}>
                  {t("profile.courier.sectionTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#388E3C" }]}>
                  {isCourierMode
                    ? t("profile.courier.badge")
                    : t("profile.courier.switchToCourier")}
                </Text>
              </View>
            </View>
          </View>
        ) : appStatus === "pending" ? (
          <View style={[styles.courierCard, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="hourglass-empty" size={28} color="#D97706" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#92400E" }]}>
                  {t("profile.courier.pendingTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#78350F" }]}>
                  {t("profile.courier.pendingBody")}
                </Text>
              </View>
            </View>
          </View>
        ) : appStatus === "rejected" ? (
          <View style={[styles.courierCard, { backgroundColor: "#FFF1F2", borderColor: "#FECDD3" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="cancel" size={28} color="#E11D48" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#9F1239" }]}>
                  {t("profile.courier.rejectedTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#881337" }]}>
                  {application?.adminNote
                    ? t("profile.courier.rejectedBody", { reason: application.adminNote })
                    : t("profile.courier.rejectedBodyNoReason")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.courierActionBtn, { backgroundColor: "#DC2626" }]}
              onPress={() => router.push("/courier-apply")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.courierActionBtnText}>
                {t("profile.courier.reapplyBtn")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.courierCard, { backgroundColor: "#FFF7F0", borderColor: "#FFD5B0" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="delivery-dining" size={28} color="#DC2626" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#DC2626" }]}>
                  {t("profile.courier.registerTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#995000" }]}>
                  {t("profile.courier.registerBody")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.courierActionBtn, { backgroundColor: "#DC2626" }]}
              onPress={() => router.push("/courier-apply")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add-circle" size={20} color="#fff" />
              <Text style={styles.courierActionBtnText}>
                {t("profile.courier.applyBtn")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {menuItems.map((item, idx) => (
            <React.Fragment key={item.label}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.danger ? "#fff0f0" : colors.secondary }]}>
                  <MaterialIcons
                    name={item.icon}
                    size={20}
                    color={item.danger ? colors.destructive : colors.primary}
                  />
                </View>
                <Text style={[styles.menuLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>
                  {item.label}
                </Text>
                {item.badge !== undefined && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
                <MaterialIcons name="chevron-right" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
              {idx < menuItems.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={20} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>
            {t("profile.signOut")}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          {t("profile.version")}
        </Text>
      </ScrollView>

      {/* Edit Name Modal */}
      <Modal
        visible={editNameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={[styles.editNameSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>تعديل الاسم</Text>
              <TouchableOpacity onPress={() => setEditNameVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.nameInput, {
                backgroundColor: colors.secondary,
                color: colors.foreground,
                borderColor: colors.border,
              }]}
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder="الاسم الكامل"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              maxLength={60}
              textAlign="right"
            />
            <View style={styles.editNameActions}>
              <TouchableOpacity
                style={[styles.editNameCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditNameVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.editNameCancelText, { color: colors.mutedForeground }]}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editNameSaveBtn, { backgroundColor: colors.primary, opacity: savingName ? 0.7 : 1 }]}
                onPress={handleSaveName}
                disabled={savingName || !editNameValue.trim()}
                activeOpacity={0.8}
              >
                {savingName
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.editNameSaveText}>حفظ</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  avatarContainer: { marginBottom: 12, position: "relative" },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  editAvatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 32, fontWeight: "800", color: "#fff" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 20, fontWeight: "800", color: "#fff" },
  phone: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  courierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  courierBadgeText: { fontSize: 12, fontWeight: "700", color: "#DC2626" },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1, height: "100%" },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: "600" },
  infoDivider: { height: 1, marginHorizontal: 14 },
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  langChipText: { flex: 1, fontSize: 14, fontWeight: "600" },
  langToggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
  langToggleBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  courierCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  courierCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  courierCardText: { flex: 1, gap: 4 },
  courierCardTitle: { fontSize: 15, fontWeight: "700" },
  courierCardBody: { fontSize: 13, lineHeight: 18 },
  courierActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  courierActionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  menuCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginRight: 4,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  divider: { height: 1, marginHorizontal: 16 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  signOutText: { fontSize: 15, fontWeight: "700" },
  version: { textAlign: "center", fontSize: 12, marginTop: 24 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  editNameSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Tajawal_500Medium",
  },
  editNameActions: { flexDirection: "row", gap: 12 },
  editNameCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  editNameCancelText: { fontSize: 15, fontWeight: "600" },
  editNameSaveBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  editNameSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
