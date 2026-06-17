import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TextInput,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { customFetch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

interface OrderHistoryItem {
  id: string;
  restaurantName: string;
  address: string;
  orderText: string;
  deliveryFee: number;
  updatedAt: string;
  customerRating: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(n: number) {
  return n.toLocaleString("ar-SY");
}

export default function OrderHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const backIcon = useBackIcon();

  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = await customFetch("/api/courier/orders/history") as OrderHistoryItem[];
      setOrders(Array.isArray(res) ? res : []);
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

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      (o.restaurantName || "").toLowerCase().includes(q) ||
      (o.address || "").toLowerCase().includes(q) ||
      (o.orderText || "").toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  const totalEarnings = filteredOrders.reduce((s, o) => s + o.deliveryFee, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>سجل التوصيلات</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>تعذّر تحميل السجل</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => loadData()}
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {orders.length > 0 && (
            <View style={[styles.summaryBar, { backgroundColor: colors.primary }]}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{filteredOrders.length}</Text>
                <Text style={styles.summaryLabel}>توصيلة{searchQuery ? " (نتائج)" : ""}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{formatAmount(totalEarnings)}</Text>
                <Text style={styles.summaryLabel}>إجمالي الأرباح (ل.س)</Text>
              </View>
            </View>
          )}

          {/* Search bar */}
          {orders.length > 0 && (
            <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialIcons name="search" size={20} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="بحث في السجل..."
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
                textAlign="right"
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <MaterialIcons name="close" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
            contentContainerStyle={[
              styles.list,
              { paddingBottom: bottomPadding + 20 },
              filteredOrders.length === 0 && styles.emptyContainer,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialIcons name="history" size={56} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {searchQuery ? "لا توجد نتائج مطابقة" : "لا توجد توصيلات بعد"}
                </Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  {searchQuery ? "جرّب كلمة بحث مختلفة" : "ستظهر هنا جميع توصيلاتك المكتملة"}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, { backgroundColor: "#f0fdf4" }]}>
                    <MaterialIcons name="check-circle" size={22} color="#22c55e" />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardRestaurant, { color: colors.foreground }]} numberOfLines={1}>
                      {item.restaurantName || "طلب توصيل"}
                    </Text>
                    <Text style={[styles.cardAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.address || "—"}
                    </Text>
                    <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                      {formatDate(item.updatedAt)}
                    </Text>
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={[styles.cardFee, { color: "#22c55e" }]}>
                      +{formatAmount(item.deliveryFee)}
                    </Text>
                    <Text style={[styles.cardFeeCurrency, { color: "#22c55e" }]}>ل.س</Text>
                  </View>
                </View>

                {item.orderText ? (
                  <Text style={[styles.cardOrderText, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {item.orderText}
                  </Text>
                ) : null}

                {item.customerRating > 0 ? (
                  <View style={styles.ratingRow}>
                    {[1,2,3,4,5].map((i) => (
                      <MaterialIcons
                        key={i}
                        name={i <= item.customerRating ? "star" : "star-border"}
                        size={14}
                        color={i <= item.customerRating ? "#FFB800" : "#d1d5db"}
                      />
                    ))}
                    <Text style={[styles.ratingLabel, { color: colors.mutedForeground }]}>
                      تقييم الزبون
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          />
        </>
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
  errorText: { fontSize: 15, fontWeight: "600" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 32,
  },
  summaryItem: { alignItems: "center", gap: 2 },
  summaryValue: { fontSize: 22, fontWeight: "900", color: "#fff" },
  summaryLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  summaryDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.3)" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  list: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1, gap: 2 },
  cardRestaurant: { fontSize: 14, fontWeight: "700" },
  cardAddress: { fontSize: 12 },
  cardDate: { fontSize: 11 },
  cardRight: { alignItems: "flex-end", gap: 2 },
  cardFee: { fontSize: 18, fontWeight: "800" },
  cardFeeCurrency: { fontSize: 11, fontWeight: "700" },
  cardOrderText: { fontSize: 13, lineHeight: 18 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingLabel: { fontSize: 11, marginRight: 4 },
});
