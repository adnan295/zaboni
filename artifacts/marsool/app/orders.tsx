import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useOrders, OrderStatus, Order } from "@/context/OrderContext";
import { useRatings } from "@/context/RatingsContext";
import { customFetch } from "@workspace/api-client-react";

const PAGE_LIMIT = 20;

const STATUS_COLOR: Record<OrderStatus, string> = {
  searching: "#d97706",
  accepted: "#2563eb",
  picked_up: "#9C27B0",
  on_way: "#059669",
  delivered: "#16a34a",
  cancelled: "#ef4444",
};

const STATUS_ICON: Record<OrderStatus, keyof typeof MaterialIcons.glyphMap> = {
  searching: "search",
  accepted: "check-circle",
  picked_up: "inventory",
  on_way: "delivery-dining",
  delivered: "done-all",
  cancelled: "cancel",
};

function SkeletonCard({ colors }: { colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.skeletonLine, { width: "60%", backgroundColor: colors.muted }]} />
      <View style={[styles.skeletonLine, { width: "30%", height: 12, backgroundColor: colors.muted }]} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={[styles.skeletonLine, { width: "90%", backgroundColor: colors.muted }]} />
      <View style={[styles.skeletonLine, { width: "75%", backgroundColor: colors.muted }]} />
    </View>
  );
}

function StarRow({ stars, size = 16 }: { stars: number; size?: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <MaterialIcons
          key={s}
          name={s <= stars ? "star" : "star-border"}
          size={size}
          color={s <= stars ? "#f59e0b" : colors.mutedForeground}
        />
      ))}
    </View>
  );
}

function OrderCard({ order }: { order: Order }) {
  const colors = useColors();
  const router = useRouter();
  const { t } = useTranslation();
  const { hasRated, getRating } = useRatings();

  const rated = hasRated(order.id);
  const rating = getRating(order.id);
  const isActive = order.status !== "delivered" && order.status !== "cancelled";

  const STATUS_LABEL: Record<OrderStatus, string> = {
    searching: t("orders.status.searching"),
    accepted: t("orders.status.accepted"),
    picked_up: t("orders.status.picked_up"),
    on_way: t("orders.status.on_way"),
    delivered: t("orders.status.delivered"),
    cancelled: t("orders.status.cancelled"),
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.restaurantName, { color: colors.foreground }]} numberOfLines={1}>
          {order.restaurantName}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[order.status] + "22" }]}>
          <MaterialIcons name={STATUS_ICON[order.status]} size={14} color={STATUS_COLOR[order.status]} />
          <Text style={[styles.statusText, { color: STATUS_COLOR[order.status] }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
      </View>

      <Text style={[styles.date, { color: colors.mutedForeground }]}>{formatDate(order.createdAt)}</Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Text style={[styles.orderText, { color: colors.foreground }]} numberOfLines={2}>
        {order.orderText}
      </Text>

      {order.status !== "searching" && order.status !== "cancelled" && (
        <View style={styles.courierRow}>
          <MaterialIcons name="delivery-dining" size={14} color={colors.primary} />
          <Text style={[styles.courierName, { color: colors.mutedForeground }]}>
            {order.courierName}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        {isActive && (
          <TouchableOpacity
            style={[styles.trackBtn, { borderColor: colors.primary }]}
            onPress={() =>
              router.push({ pathname: "/order-tracking/[id]", params: { id: order.id } })
            }
          >
            <MaterialIcons name="delivery-dining" size={16} color={colors.primary} />
            <Text style={[styles.trackBtnText, { color: colors.primary }]}>{t("orders.track")}</Text>
          </TouchableOpacity>
        )}

        {isActive && order.status !== "searching" && (
          <TouchableOpacity
            style={[styles.chatBtn, { backgroundColor: colors.secondary }]}
            onPress={() =>
              router.push({ pathname: "/chat/[orderId]", params: { orderId: order.id } })
            }
          >
            <MaterialIcons name="chat" size={16} color={colors.primary} />
            <Text style={[styles.chatBtnText, { color: colors.primary }]}>{t("orders.chat")}</Text>
          </TouchableOpacity>
        )}

        {order.status === "delivered" && !rated && (
          <TouchableOpacity
            style={[styles.rateBtn, { backgroundColor: colors.primary }]}
            onPress={() =>
              router.push({ pathname: "/rate-order", params: { orderId: order.id, restaurantName: order.restaurantName } })
            }
          >
            <MaterialIcons name="star" size={16} color="#fff" />
            <Text style={styles.rateBtnText}>{t("orders.rate")}</Text>
          </TouchableOpacity>
        )}

        {rated && rating && (
          <View style={styles.ratedRow}>
            <MaterialIcons name="restaurant" size={13} color={colors.mutedForeground} />
            <StarRow stars={rating.restaurantStars} />
            <MaterialIcons name="delivery-dining" size={13} color={colors.mutedForeground} />
            <StarRow stars={rating.courierStars} />
          </View>
        )}
      </View>
    </View>
  );
}

type PaginatedOrdersResponse = {
  orders: {
    id: string;
    orderText: string;
    restaurantName: string;
    status: string;
    courierName: string;
    courierPhone: string;
    courierRating: number;
    courierId: string;
    createdAt: string;
    address: string;
    estimatedMinutes: number;
  }[];
  total: number;
  hasMore: boolean;
  page: number;
};

function toLocalOrder(o: PaginatedOrdersResponse["orders"][number]): Order {
  return {
    id: o.id,
    orderText: o.orderText,
    restaurantName: o.restaurantName,
    status: o.status as OrderStatus,
    courierName: o.courierName,
    courierPhone: o.courierPhone,
    courierRating: o.courierRating,
    courierId: o.courierId,
    createdAt: new Date(o.createdAt).getTime(),
    address: o.address,
    estimatedMinutes: o.estimatedMinutes,
  };
}

export default function OrdersScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { orders: contextOrders } = useOrders();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const [page, setPage] = useState(1);
  const [serverOrders, setServerOrders] = useState<Order[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  const fetchPage = useCallback(async (pageNum: number, reset = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await customFetch(`/api/orders?page=${pageNum}&limit=${PAGE_LIMIT}`) as PaginatedOrdersResponse;
      const fetched = (data.orders ?? []).map(toLocalOrder);
      setServerOrders((prev) => reset ? fetched : [...prev, ...fetched]);
      setHasMore(data.hasMore ?? false);
      setPage(pageNum);
    } catch {
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setInitialLoad(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  const allOrders = serverOrders.length > 0 ? serverOrders : contextOrders;

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPage(page + 1);
    }
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (!hasMore && allOrders.length > 0) {
      return (
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <Text style={[{ fontSize: 12, color: colors.mutedForeground }]}>{t("orders.allLoaded")}</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("orders.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {initialLoad || loading ? (
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(i) => String(i)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomPadding + 20 }}
          renderItem={() => <SkeletonCard colors={colors} />}
        />
      ) : allOrders.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="receipt-long" size={64} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("orders.empty.title")}</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {t("orders.empty.body")}
          </Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={styles.browseBtnText}>{t("orders.empty.browse")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={allOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomPadding + 20 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <OrderCard order={item} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
        />
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
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  emptyBody: { fontSize: 14, textAlign: "center" },
  browseBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  browseBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  restaurantName: { fontSize: 16, fontWeight: "800", flex: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "700" },
  date: { fontSize: 12 },
  divider: { height: 1 },
  orderText: { fontSize: 13, lineHeight: 20, textAlign: "right" },
  courierRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  courierName: { fontSize: 12 },
  footer: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  trackBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  trackBtnText: { fontSize: 13, fontWeight: "700" },
  chatBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  chatBtnText: { fontSize: 13, fontWeight: "700" },
  rateBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  rateBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  ratedRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  skeletonLine: { height: 16, borderRadius: 8, marginBottom: 4 },
});
