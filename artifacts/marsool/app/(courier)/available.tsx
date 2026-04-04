import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useCourier, CourierOrder } from "@/context/CourierContext";

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 1) return "الآن";
  if (diff < 60) return `منذ ${diff} دقيقة`;
  return `منذ ${Math.floor(diff / 60)} ساعة`;
}

function OrderCard({
  order,
  onAccept,
}: {
  order: CourierOrder;
  onAccept: (id: string) => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await onAccept(order.id);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        {order.restaurantName ? (
          <View style={styles.row}>
            <MaterialIcons name="restaurant" size={16} color={colors.primary} />
            <Text style={[styles.restaurant, { color: colors.primary }]}>{order.restaurantName}</Text>
          </View>
        ) : null}
        <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
          {timeAgo(order.createdAt)}
        </Text>
      </View>

      <View style={[styles.detailRow, { borderColor: colors.border }]}>
        <MaterialIcons name="notes" size={16} color={colors.mutedForeground} />
        <Text style={[styles.orderText, { color: colors.foreground }]} numberOfLines={3}>
          {order.orderText}
        </Text>
      </View>

      {order.address ? (
        <View style={styles.detailRow}>
          <MaterialIcons name="location-on" size={16} color={colors.mutedForeground} />
          <Text style={[styles.address, { color: colors.mutedForeground }]} numberOfLines={2}>
            {order.address}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.acceptBtn, { backgroundColor: accepting ? colors.border : colors.primary }]}
        onPress={handleAccept}
        disabled={accepting}
        activeOpacity={0.8}
      >
        <MaterialIcons name="check-circle" size={20} color="#fff" />
        <Text style={styles.acceptBtnText}>
          {accepting ? t("courier.available.accepting") : t("courier.available.accept")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AvailableOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { availableOrders, isLoadingAvailable, refreshAvailableOrders, acceptOrder } = useCourier();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleAccept = useCallback(
    async (orderId: string) => {
      try {
        await acceptOrder(orderId);
      } catch {
        Alert.alert(t("common.error"), t("courier.available.acceptError"));
      }
    },
    [acceptOrder, t]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <MaterialIcons name="delivery-dining" size={24} color="#fff" />
        <Text style={styles.headerTitle}>{t("courier.available.title")}</Text>
        <TouchableOpacity onPress={refreshAvailableOrders} style={styles.refreshBtn}>
          <MaterialIcons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={availableOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard order={item} onAccept={handleAccept} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: bottomPadding + 20 },
          availableOrders.length === 0 && styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingAvailable}
            onRefresh={refreshAvailableOrders}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          !isLoadingAvailable ? (
            <View style={styles.empty}>
              <MaterialIcons name="inbox" size={56} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t("courier.available.empty.title")}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                {t("courier.available.empty.body")}
              </Text>
            </View>
          ) : null
        }
      />
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
  refreshBtn: { padding: 4 },
  list: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  restaurant: { fontSize: 14, fontWeight: "700" },
  timeAgo: { fontSize: 12 },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  orderText: { flex: 1, fontSize: 15, lineHeight: 22 },
  address: { flex: 1, fontSize: 13 },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  acceptBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
