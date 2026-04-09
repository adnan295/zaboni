import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, signOut, isCourier, isCourierMode, setCourierMode, refreshRole } = useAuth();
  const { orders } = useOrders();
  const { favorites } = useFavorites();
  const { unreadCount } = useNotifications();
  const { ratings } = useRatings();
  const { language, setLanguage } = useLanguage();

  const [application, setApplication] = useState<CourierApplication | null>(null);
  const [appLoading, setAppLoading] = useState(false);

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

  useEffect(() => {
    if (isCourier || !user) return;
    setAppLoading(true);
    customFetch("/api/courier/my-application")
      .then(async (data) => {
        const app = data as CourierApplication | null;
        setApplication(app);
        if (app?.status === "approved") {
          await refreshRole();
        }
      })
      .catch(() => setApplication(null))
      .finally(() => setAppLoading(false));
  }, [isCourier, user?.id]);

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

  const handleSwitchToCourier = async () => {
    await setCourierMode(true);
  };

  const handleSwitchToCustomer = async () => {
    await setCourierMode(false);
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
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>
              {user?.name ? user.name.charAt(0) : "؟"}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{user?.name ?? t("profile.defaultUser")}</Text>
        <Text style={styles.phone}>{displayPhone}</Text>
        {isCourier && (
          <View style={styles.courierBadge}>
            <MaterialIcons name="verified" size={14} color="#FF6B00" />
            <Text style={styles.courierBadgeText}>{t("profile.courier.badge")}</Text>
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
            <Text style={[styles.statNum, { color: colors.primary }]}>{orders.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.orders")}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{favorites.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.favorites")}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{avgRating}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("profile.stats.avgRating")}</Text>
          </View>
        </View>

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
          /* Already a courier — show mode switcher */
          <View style={[styles.courierCard, { backgroundColor: "#F0FFF4", borderColor: "#B0E8C0" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="verified" size={28} color="#4CAF50" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#2E7D32" }]}>
                  {t("profile.courier.sectionTitle")}
                </Text>
              </View>
            </View>
            {isCourierMode ? (
              <TouchableOpacity
                style={[styles.courierActionBtn, { backgroundColor: "#616161" }]}
                onPress={handleSwitchToCustomer}
                activeOpacity={0.8}
              >
                <MaterialIcons name="swap-horiz" size={20} color="#fff" />
                <Text style={styles.courierActionBtnText}>
                  {t("profile.courier.switchToCustomer")}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.courierActionBtn, { backgroundColor: "#4CAF50" }]}
                onPress={handleSwitchToCourier}
                activeOpacity={0.8}
              >
                <MaterialIcons name="delivery-dining" size={20} color="#fff" />
                <Text style={styles.courierActionBtnText}>
                  {t("profile.courier.switchToCourier")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : appStatus === "pending" ? (
          /* Application pending — show waiting card */
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
          /* Application rejected — show rejection + reapply button */
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
              style={[styles.courierActionBtn, { backgroundColor: "#FF6B00" }]}
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
          /* No application — show apply card */
          <View style={[styles.courierCard, { backgroundColor: "#FFF7F0", borderColor: "#FFD5B0" }]}>
            <View style={styles.courierCardHeader}>
              <MaterialIcons name="delivery-dining" size={28} color="#FF6B00" />
              <View style={styles.courierCardText}>
                <Text style={[styles.courierCardTitle, { color: "#FF6B00" }]}>
                  {t("profile.courier.registerTitle")}
                </Text>
                <Text style={[styles.courierCardBody, { color: "#995000" }]}>
                  {t("profile.courier.registerBody")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.courierActionBtn, { backgroundColor: "#FF6B00" }]}
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
  avatarContainer: { marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 32, fontWeight: "800", color: "#fff" },
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
  courierBadgeText: { fontSize: 12, fontWeight: "700", color: "#FF6B00" },
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
});
