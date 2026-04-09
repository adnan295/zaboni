import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { customFetch } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

interface RatingItem {
  id: string;
  orderId: string;
  stars: number;
  comment: string;
  restaurantName: string;
  createdAt: string;
}

interface RatingsData {
  ratings: RatingItem[];
  avgStars: number | null;
  total: number;
}

function Stars({ count }: { count: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialIcons
          key={i}
          name={i <= count ? "star" : "star-border"}
          size={16}
          color={i <= count ? "#FFB800" : "#d1d5db"}
        />
      ))}
    </View>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SY", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MyRatingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const backIcon = useBackIcon();

  const [data, setData] = useState<RatingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = await customFetch("/api/courier/my-ratings") as RatingsData;
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تقييمات الزبائن</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>تعذّر تحميل التقييمات</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => loadData()}
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Summary */}
          <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
            <View style={styles.summaryInner}>
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryBig}>
                  {data?.avgStars != null ? data.avgStars.toFixed(1) : "—"}
                </Text>
                <View style={{ flexDirection: "row" }}>
                  {[1,2,3,4,5].map((i) => (
                    <MaterialIcons
                      key={i}
                      name={i <= Math.round(data?.avgStars ?? 0) ? "star" : "star-border"}
                      size={18}
                      color="#FFB800"
                    />
                  ))}
                </View>
                <Text style={styles.summaryLabel}>متوسط التقييم</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryBig}>{data?.total ?? 0}</Text>
                <MaterialIcons name="rate-review" size={22} color="rgba(255,255,255,0.8)" />
                <Text style={styles.summaryLabel}>إجمالي التقييمات</Text>
              </View>
            </View>
          </View>

          <FlatList
            data={data?.ratings ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
            contentContainerStyle={[
              styles.list,
              { paddingBottom: bottomPadding + 20 },
              (data?.ratings ?? []).length === 0 && styles.emptyContainer,
            ]}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialIcons name="star-border" size={56} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا توجد تقييمات بعد</Text>
                <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                  ستظهر هنا تقييمات الزبائن بعد إتمام التوصيلات
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.ratingCard, {
                backgroundColor: colors.card,
                borderColor: item.stars >= 4 ? "#bbf7d0" : item.stars === 3 ? colors.border : "#fecaca",
              }]}>
                <View style={styles.ratingHeader}>
                  <Stars count={item.stars} />
                  <Text style={[styles.ratingDate, { color: colors.mutedForeground }]}>
                    {formatDate(item.createdAt)}
                  </Text>
                </View>
                {item.restaurantName ? (
                  <View style={styles.ratingMeta}>
                    <MaterialIcons name="restaurant" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.ratingMetaText, { color: colors.mutedForeground }]}>
                      {item.restaurantName}
                    </Text>
                  </View>
                ) : null}
                {item.comment ? (
                  <Text style={[styles.ratingComment, { color: colors.foreground }]}>
                    "{item.comment}"
                  </Text>
                ) : (
                  <Text style={[styles.ratingNoComment, { color: colors.mutedForeground }]}>
                    بدون تعليق
                  </Text>
                )}
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
  summaryCard: { paddingVertical: 20 },
  summaryInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  summaryBlock: { alignItems: "center", gap: 6 },
  summaryBig: { fontSize: 36, fontWeight: "900", color: "#fff" },
  summaryLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  summaryDivider: { width: 1, height: 60, backgroundColor: "rgba(255,255,255,0.3)" },
  list: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  ratingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  ratingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  starsRow: { flexDirection: "row", gap: 2 },
  ratingDate: { fontSize: 12 },
  ratingMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingMetaText: { fontSize: 12 },
  ratingComment: { fontSize: 14, lineHeight: 20, fontStyle: "italic" },
  ratingNoComment: { fontSize: 13 },
});
