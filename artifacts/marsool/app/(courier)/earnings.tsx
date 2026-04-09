import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { customFetch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

interface RecentDelivery {
  id: string;
  restaurantName: string;
  address: string;
  updatedAt: string;
  earnings: number;
}

interface EarningsData {
  todayEarnings: number;
  weekEarnings: number;
  totalEarnings: number;
  todayDeliveries: number;
  weekDeliveries: number;
  totalDeliveries: number;
  deliveryFee: number;
  recentDeliveries: RecentDelivery[];
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("ar-SY");
}

export default function CourierEarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const backIcon = useBackIcon();

  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = await customFetch("/api/courier/earnings") as EarningsData;
      setData(res);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("ar-SY", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("courier.earnings.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            {t("courier.earnings.loading")}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>{t("courier.earnings.error")}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => loadData()}
          >
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPadding + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.summarySection, { backgroundColor: colors.primary }]}>
            <Text style={styles.summaryLabel}>{t("courier.earnings.perDelivery", { amount: formatAmount(data!.deliveryFee) })}</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <MaterialIcons name="today" size={24} color={colors.primary} />
              <Text style={[styles.statAmount, { color: colors.foreground }]}>
                {formatAmount(data!.todayEarnings)}
              </Text>
              <Text style={[styles.statCurrency, { color: colors.primary }]}>ل.س</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("courier.earnings.today")}</Text>
              <Text style={[styles.statSub, { color: colors.mutedForeground }]}>
                {data!.todayDeliveries} {t("courier.earnings.deliveries")}
              </Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <MaterialIcons name="date-range" size={24} color="#8b5cf6" />
              <Text style={[styles.statAmount, { color: colors.foreground }]}>
                {formatAmount(data!.weekEarnings)}
              </Text>
              <Text style={[styles.statCurrency, { color: "#8b5cf6" }]}>ل.س</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("courier.earnings.week")}</Text>
              <Text style={[styles.statSub, { color: colors.mutedForeground }]}>
                {data!.weekDeliveries} {t("courier.earnings.deliveries")}
              </Text>
            </View>

            <View style={[styles.statCard, styles.statCardFull, { backgroundColor: colors.card }]}>
              <MaterialIcons name="account-balance-wallet" size={24} color="#22c55e" />
              <Text style={[styles.statAmount, { color: colors.foreground }]}>
                {formatAmount(data!.totalEarnings)}
              </Text>
              <Text style={[styles.statCurrency, { color: "#22c55e" }]}>ل.س</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t("courier.earnings.total")}</Text>
              <Text style={[styles.statSub, { color: colors.mutedForeground }]}>
                {data!.totalDeliveries} {t("courier.earnings.deliveries")}
              </Text>
            </View>
          </View>

          <View style={[styles.recentSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.recentTitle, { color: colors.foreground }]}>
              {t("courier.earnings.recentTitle")}
            </Text>

            {data!.recentDeliveries.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="local-shipping" size={40} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {t("courier.earnings.noDeliveries")}
                </Text>
              </View>
            ) : (
              data!.recentDeliveries.map((d, i) => (
                <View key={d.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.deliveryRow}>
                    <View style={[styles.deliveryIcon, { backgroundColor: colors.secondary }]}>
                      <MaterialIcons name="check-circle" size={18} color="#22c55e" />
                    </View>
                    <View style={styles.deliveryInfo}>
                      <Text style={[styles.deliveryRestaurant, { color: colors.foreground }]}>
                        {d.restaurantName || t("courier.earnings.restaurant")}
                      </Text>
                      <Text style={[styles.deliveryAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {d.address}
                      </Text>
                      <Text style={[styles.deliveryDate, { color: colors.mutedForeground }]}>
                        {formatDate(d.updatedAt)}
                      </Text>
                    </View>
                    <View style={styles.deliveryEarnings}>
                      <Text style={[styles.deliveryAmount, { color: "#22c55e" }]}>
                        +{formatAmount(d.earnings)}
                      </Text>
                      <Text style={[styles.deliveryAmountCurrency, { color: "#22c55e" }]}>ل.س</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
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
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, marginTop: 8 },
  errorText: { fontSize: 15, fontWeight: "600" },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  summarySection: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  summaryLabel: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
  },
  statCard: {
    flex: 1,
    minWidth: "44%",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardFull: {
    width: "100%",
    flex: 0,
  },
  statAmount: { fontSize: 28, fontWeight: "800" },
  statCurrency: { fontSize: 13, fontWeight: "700", marginTop: -4 },
  statLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  statSub: { fontSize: 11 },
  recentSection: {
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
  recentTitle: {
    fontSize: 15,
    fontWeight: "800",
    padding: 16,
    paddingBottom: 8,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: { fontSize: 13 },
  divider: { height: 1, marginHorizontal: 16 },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  deliveryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryInfo: { flex: 1, gap: 2 },
  deliveryRestaurant: { fontSize: 14, fontWeight: "700" },
  deliveryAddress: { fontSize: 12 },
  deliveryDate: { fontSize: 11, marginTop: 2 },
  deliveryEarnings: { alignItems: "flex-end", gap: 2 },
  deliveryAmount: { fontSize: 16, fontWeight: "800" },
  deliveryAmountCurrency: { fontSize: 11, fontWeight: "700" },
});
