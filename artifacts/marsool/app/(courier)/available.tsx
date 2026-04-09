import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";
import { useCourier, CourierOrder } from "@/context/CourierContext";

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 1) return "الآن";
  if (diff < 60) return `منذ ${diff} د`;
  return `منذ ${Math.floor(diff / 60)} س`;
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
        <View style={styles.row}>
          {order.restaurantName ? (
            <>
              <MaterialIcons name="restaurant" size={15} color={colors.primary} />
              <Text style={[styles.restaurant, { color: colors.primary }]}>{order.restaurantName}</Text>
            </>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          {order.distanceKm !== undefined ? (
            <View style={[styles.distanceBadge, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="near-me" size={12} color={colors.primary} />
              <Text style={[styles.distanceText, { color: colors.primary }]}>
                {order.distanceKm} كم
              </Text>
            </View>
          ) : null}
          {order.deliveryFee != null && order.deliveryFee > 0 ? (
            <View style={[styles.feeBadge, { backgroundColor: "#fff7ed" }]}>
              <MaterialIcons name="account-balance-wallet" size={12} color="#ea580c" />
              <Text style={[styles.feeText, { color: "#ea580c" }]}>
                {order.deliveryFee.toLocaleString("ar-SY")} ل.س
              </Text>
            </View>
          ) : null}
          <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
            {timeAgo(order.createdAt)}
          </Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <MaterialIcons name="notes" size={15} color={colors.mutedForeground} />
        <Text style={[styles.orderText, { color: colors.foreground }]} numberOfLines={3}>
          {order.orderText}
        </Text>
      </View>

      {order.address ? (
        <View style={styles.detailRow}>
          <MaterialIcons name="location-on" size={15} color={colors.mutedForeground} />
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

const AUTO_OFFLINE_THRESHOLD = 3;

export default function AvailableOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const {
    availableOrders,
    isLoadingAvailable,
    isOnline,
    isTogglingOnline,
    refreshAvailableOrders,
    acceptOrder,
    updateLocation,
    toggleAvailability,
  } = useCourier();
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);
  const prevOrderIds = useRef<Set<string>>(new Set());
  const missedCount = useRef(0);
  const isFirstLoad = useRef(true);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (!isOnline) {
      missedCount.current = 0;
      prevOrderIds.current = new Set();
      isFirstLoad.current = true;
      return;
    }

    const currentIds = new Set(availableOrders.map((o) => o.id));

    if (isFirstLoad.current) {
      prevOrderIds.current = currentIds;
      isFirstLoad.current = false;
      return;
    }

    let disappeared = 0;
    for (const id of prevOrderIds.current) {
      if (!currentIds.has(id)) disappeared++;
    }

    if (disappeared > 0) {
      missedCount.current += disappeared;
      if (missedCount.current >= AUTO_OFFLINE_THRESHOLD) {
        missedCount.current = 0;
        prevOrderIds.current = new Set();
        Alert.alert(
          "تم تحويلك إلى أوفلاين",
          `فاتتك ${AUTO_OFFLINE_THRESHOLD} طلبات متتالية. سيتم تحويلك إلى وضع غير متاح تلقائياً.`,
          [{ text: "حسناً", style: "default" }]
        );
        toggleAvailability();
        return;
      }
    }

    prevOrderIds.current = currentIds;
  }, [availableOrders, isOnline]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || !active) return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) {
          await updateLocation(loc.coords.latitude, loc.coords.longitude);
          await refreshAvailableOrders();
        }
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 15000 },
          (position) => {
            if (active) updateLocation(position.coords.latitude, position.coords.longitude);
          }
        );
        if (active) {
          locationWatcher.current = watcher;
        } else {
          watcher.remove();
        }
      } catch {
      }
    })();
    return () => {
      active = false;
      locationWatcher.current?.remove();
      locationWatcher.current = null;
    };
  }, []);

  const handleAccept = useCallback(
    async (orderId: string) => {
      missedCount.current = 0;
      try {
        await acceptOrder(orderId);
      } catch {
        Alert.alert(t("common.error"), t("courier.available.acceptError"));
      }
    },
    [acceptOrder, t]
  );

  const handleRefresh = useCallback(async () => {
    if (Platform.OS !== "web") {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await updateLocation(loc.coords.latitude, loc.coords.longitude);
        }
      } catch {
      }
    }
    await refreshAvailableOrders();
  }, [refreshAvailableOrders, updateLocation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <MaterialIcons name="delivery-dining" size={24} color="#fff" />
        <Text style={styles.headerTitle}>{t("courier.available.title")}</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} disabled={isTogglingOnline}>
          <MaterialIcons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.toggleRow, { backgroundColor: isOnline ? "#f0fdf4" : "#fef2f2", borderColor: isOnline ? "#bbf7d0" : "#fecaca" }]}>
        <View style={styles.toggleInfo}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? "#22c55e" : "#ef4444" }]} />
          <View>
            <Text style={[styles.toggleLabel, { color: isOnline ? "#15803d" : "#dc2626" }]}>
              {isOnline ? t("courier.available.online") : t("courier.available.offline")}
            </Text>
            <Text style={[styles.toggleSub, { color: isOnline ? "#16a34a" : "#ef4444" }]}>
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
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          !isLoadingAvailable ? (
            <View style={styles.empty}>
              {isOnline ? (
                <>
                  <MaterialIcons name="inbox" size={56} color={colors.border} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                    {t("courier.available.empty.title")}
                  </Text>
                  <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                    {t("courier.available.empty.body")}
                  </Text>
                </>
              ) : (
                <>
                  <MaterialIcons name="power-settings-new" size={56} color="#ef4444" />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                    {t("courier.available.offlineTitle")}
                  </Text>
                  <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                    {t("courier.available.offlineBody")}
                  </Text>
                  <TouchableOpacity
                    style={[styles.goOnlineBtn, { backgroundColor: "#22c55e" }]}
                    onPress={toggleAvailability}
                    disabled={isTogglingOnline}
                  >
                    <MaterialIcons name="power-settings-new" size={18} color="#fff" />
                    <Text style={styles.goOnlineBtnText}>{t("courier.available.goOnline")}</Text>
                  </TouchableOpacity>
                </>
              )}
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  toggleLabel: { fontSize: 15, fontWeight: "700" },
  toggleSub: { fontSize: 12, marginTop: 1 },
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
    flexWrap: "wrap",
    gap: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  restaurant: { fontSize: 14, fontWeight: "700" },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distanceText: { fontSize: 12, fontWeight: "700" },
  feeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  feeText: { fontSize: 12, fontWeight: "700" },
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
  goOnlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  goOnlineBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
