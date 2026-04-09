import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Switch,
  TouchableOpacity,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";
import { useCourier } from "@/context/CourierContext";
import { useRouter } from "expo-router";

interface CourierStats {
  deliveredCount: number;
  avgRating: number | null;
  name: string;
  phone: string;
  role: string;
}

interface SubscriptionStatus {
  status: "paid" | "waived" | "pending";
  amount: number;
  date: string;
  note?: string | null;
}

export default function CourierProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOnline, isTogglingOnline, toggleAvailability } = useCourier();
  const [stats, setStats] = useState<CourierStats | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    (async () => {
      try {
        const [statsData, subData] = await Promise.all([
          customFetch("/api/courier/stats") as Promise<CourierStats>,
          customFetch("/api/courier/subscription/today") as Promise<SubscriptionStatus>,
        ]);
        setStats(statsData);
        setSubscription(subData);
      } catch {
        setStats(null);
        setSubscription(null);
      } finally {
        setLoading(false);
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
            <View style={[styles.avatar, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <MaterialIcons name="delivery-dining" size={48} color="#fff" />
            </View>
            <Text style={styles.userName}>{stats?.name || user?.name || t("profile.defaultUser")}</Text>
            <Text style={styles.userPhone}>{stats?.phone || user?.phone || ""}</Text>
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
                onValueChange={toggleAvailability}
                trackColor={{ false: "#fca5a5", true: "#86efac" }}
                thumbColor={isOnline ? "#22c55e" : "#ef4444"}
                ios_backgroundColor="#fca5a5"
              />
            )}
          </View>

          {subscription !== null && (
            <View style={[
              styles.subscriptionCard,
              {
                backgroundColor: subscription.status === "pending" ? "#fff7ed" : "#f0fdf4",
                borderColor: subscription.status === "pending" ? "#fed7aa" : "#bbf7d0",
              },
            ]}>
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
            </View>
          )}

          <TouchableOpacity
            style={[styles.earningsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push("/(courier)/earnings")}
            activeOpacity={0.8}
          >
            <View style={[styles.earningsBtnIcon, { backgroundColor: "#fef9c3" }]}>
              <MaterialIcons name="account-balance-wallet" size={22} color="#ca8a04" />
            </View>
            <Text style={[styles.earningsBtnText, { color: colors.foreground }]}>
              {t("courier.earnings.title")}
            </Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </ScrollView>
      )}
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
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
  earningsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  earningsBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  earningsBtnText: { flex: 1, fontSize: 15, fontWeight: "700" },
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
});
