import React, { useState, useCallback, useRef } from "react";
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
import {
  useCourierColors as useColors,
  CourierHeader,
} from "@/components/CourierUI";
import { useRouter } from "expo-router";
import { useCourier, CourierOrder } from "@/context/CourierContext";

function ageMinutes(isoString: string): number {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
}

function timeAgo(isoString: string): string {
  const diff = ageMinutes(isoString);
  if (diff < 1) return "الآن";
  if (diff < 60) return `منذ ${diff} د`;
  return `منذ ${Math.floor(diff / 60)} س`;
}

function OrderCard({
  order,
  onAccept,
  blockReason,
}: {
  order: CourierOrder;
  onAccept: (id: string) => Promise<void>;
  blockReason: "max" | "pickup_first" | "stale" | null;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const [accepting, setAccepting] = useState(false);
  const acceptingRef = useRef(false);

  const handleAccept = async () => {
    if (acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    try {
      await onAccept(order.id);
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  };

  const isBlocked = blockReason !== null || accepting;

  const age = ageMinutes(order.createdAt);
  const isOld = age > 20;
  const isErrand = order.orderType === "errand";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isErrand ? "#fed7aa" : isOld ? "#fca5a5" : colors.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.row}>
          {isErrand ? (
            <>
              <MaterialIcons name="shopping-bag" size={15} color="#ea580c" />
              <Text style={[styles.restaurant, { color: "#ea580c" }]}>
                {order.placeName ?? t("errand.badge")}
              </Text>
              <View style={styles.errandBadge}>
                <Text style={styles.errandBadgeText}>{t("errand.badge")}</Text>
              </View>
            </>
          ) : order.restaurantName ? (
            <>
              <MaterialIcons
                name="restaurant"
                size={15}
                color={colors.primary}
              />
              <Text style={[styles.restaurant, { color: colors.primary }]}>
                {order.restaurantName}
              </Text>
            </>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          {order.deliveryFee != null && order.deliveryFee > 0 ? (
            <View style={[styles.feeBadge, { backgroundColor: "#fff7ed" }]}>
              <MaterialIcons
                name="account-balance-wallet"
                size={12}
                color="#ea580c"
              />
              <Text style={[styles.feeText, { color: "#ea580c" }]}>
                {order.deliveryFee.toLocaleString("ar-SY")} ل.س
              </Text>
            </View>
          ) : null}
          {isOld ? (
            <View style={[styles.oldBadge]}>
              <MaterialIcons name="warning" size={11} color="#dc2626" />
              <Text style={styles.oldBadgeText}>طلب قديم</Text>
            </View>
          ) : null}
          <Text
            style={[
              styles.timeAgo,
              { color: isOld ? "#dc2626" : colors.mutedForeground },
            ]}
          >
            {timeAgo(order.createdAt)}
          </Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <MaterialIcons name="notes" size={15} color={colors.mutedForeground} />
        <Text
          style={[styles.orderText, { color: colors.foreground }]}
          numberOfLines={3}
        >
          {order.orderText}
        </Text>
      </View>

      {order.address ? (
        <View style={styles.detailRow}>
          <MaterialIcons
            name="location-on"
            size={15}
            color={colors.mutedForeground}
          />
          <Text
            style={[styles.address, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {order.address}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.acceptBtn,
          { backgroundColor: isBlocked ? colors.border : colors.primary },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`قبول طلب ${order.restaurantName || order.placeName || "توصيل"}`}
        onPress={handleAccept}
        disabled={isBlocked}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name={blockReason ? "block" : "check-circle"}
          size={20}
          color="#fff"
        />
        <Text style={styles.acceptBtnText}>
          {blockReason === "stale"
            ? "حدّث الطلبات أولاً"
            : blockReason === "max"
              ? "عندك طلبين بالفعل"
              : blockReason === "pickup_first"
                ? "استلم طلبك الحالي من المطعم أولاً"
                : accepting
                  ? t("courier.available.accepting")
                  : t("courier.available.accept")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AvailableOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    availableOrders,
    activeOrders,
    availableOrdersError,
    isLoadingAvailable,
    isOnline,
    isTogglingOnline,
    refreshAvailableOrders,
    acceptOrder,
    toggleAvailability,
  } = useCourier();

  // Mirror the server's stacking rule: a courier can hold up to 2 orders, and a
  // 2nd can only be taken once the current one is picked up (picked_up/on_way).
  const MAX_ACTIVE_ORDERS = 2;
  const activeCount = activeOrders.length;
  const allPickedUp = activeOrders.every(
    (o) => o.status === "picked_up" || o.status === "on_way",
  );
  const blockReason: "max" | "pickup_first" | null =
    activeCount >= MAX_ACTIVE_ORDERS
      ? "max"
      : activeCount > 0 && !allPickedUp
        ? "pickup_first"
        : null;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleAccept = useCallback(
    async (orderId: string) => {
      try {
        await acceptOrder(orderId);
        router.navigate("/(courier)/active");
      } catch {
        Alert.alert(t("common.error"), t("courier.available.acceptError"));
      }
    },
    [acceptOrder, t, router],
  );

  const handleToggleAvailability = useCallback(async () => {
    try {
      await toggleAvailability();
    } catch (err) {
      Alert.alert(
        t("courier.availabilityToggle.errorTitle"),
        err instanceof Error
          ? err.message
          : t("courier.availabilityToggle.errorMsg"),
      );
    }
  }, [toggleAvailability]);

  const handleRefresh = useCallback(async () => {
    await refreshAvailableOrders();
  }, [refreshAvailableOrders]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CourierHeader
        title="جاهز ليوم جديد؟"
        subtitle="طلباتك ورحلتك، كل شيء بمكان واحد"
        onRefresh={handleRefresh}
      />
      <FlatList
        data={isOnline ? availableOrders : []}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 16, alignSelf: "stretch" }}>
            <View
              style={[
                styles.toggleRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={[styles.toggleInfo, { flex: 1 }]}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnline ? "#16805C" : "#596B7A" },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.toggleLabel, { color: colors.foreground }]}
                  >
                    {isOnline ? "متاح لاستقبال الطلبات" : "أنت غير متاح الآن"}
                  </Text>
                  <Text
                    style={[
                      styles.toggleSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {isOnline
                      ? "سننبهك عند توفر طلب"
                      : "فعّل الاستقبال لتبدأ العمل"}
                  </Text>
                </View>
              </View>
              {isTogglingOnline ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Switch
                  accessibilityLabel="استقبال الطلبات"
                  value={isOnline}
                  onValueChange={handleToggleAvailability}
                  trackColor={{ false: "#CDD6DE", true: "#B6E4D2" }}
                  thumbColor={isOnline ? "#16805C" : "#596B7A"}
                />
              )}
            </View>
            {activeCount > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => router.navigate("/(courier)/active")}
                style={{
                  backgroundColor: "#172B3A",
                  borderRadius: 20,
                  padding: 20,
                  gap: 8,
                }}
              >
                <Text style={{ color: "#CAD8E2", fontSize: 13 }}>
                  عندك {activeCount} طلب قيد التوصيل
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <MaterialIcons
                    name="delivery-dining"
                    size={26}
                    color="#fff"
                  />
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 19,
                      fontWeight: "800",
                      flex: 1,
                    }}
                  >
                    كمّل رحلتك الحالية
                  </Text>
                  <MaterialIcons name="arrow-back" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            )}
            {isOnline && availableOrdersError && availableOrders.length > 0 && (
              <Text
                accessibilityRole="alert"
                style={{ color: "#B45309", fontSize: 14 }}
              >
                تعذّر تحديث الطلبات. اسحب للتحديث قبل اختيار طلب.
              </Text>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: colors.foreground,
                }}
              >
                الطلبات المتاحة
              </Text>
              <Text style={{ color: colors.mutedForeground }}>
                {isOnline ? availableOrders.length : 0} طلب
              </Text>
            </View>
          </View>
        }
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onAccept={handleAccept}
            blockReason={availableOrdersError ? "stale" : blockReason}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: bottomPadding + 20 },
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
              {isOnline && availableOrdersError ? (
                <>
                  <MaterialIcons name="wifi-off" size={56} color="#ef4444" />
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    {t("courier.available.errorTitle")}
                  </Text>
                  <Text
                    style={[
                      styles.emptyBody,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("courier.available.errorBody")}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.goOnlineBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={handleRefresh}
                    disabled={isLoadingAvailable}
                  >
                    <MaterialIcons name="refresh" size={18} color="#fff" />
                    <Text style={styles.goOnlineBtnText}>
                      {t("common.retry")}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : isOnline ? (
                <>
                  <MaterialIcons name="inbox" size={56} color={colors.border} />
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    {t("courier.available.empty.title")}
                  </Text>
                  <Text
                    style={[
                      styles.emptyBody,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("courier.available.empty.body")}
                  </Text>
                </>
              ) : (
                <>
                  <MaterialIcons
                    name="power-settings-new"
                    size={56}
                    color="#ef4444"
                  />
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    {t("courier.available.offlineTitle")}
                  </Text>
                  <Text
                    style={[
                      styles.emptyBody,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("courier.available.offlineBody")}
                  </Text>
                  <TouchableOpacity
                    style={[styles.goOnlineBtn, { backgroundColor: "#22c55e" }]}
                    onPress={handleToggleAvailability}
                    disabled={isTogglingOnline}
                  >
                    <MaterialIcons
                      name="power-settings-new"
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.goOnlineBtnText}>
                      {t("courier.available.goOnline")}
                    </Text>
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 20,
  },
  toggleInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  toggleLabel: { fontSize: 15, fontWeight: "700" },
  toggleSub: { fontSize: 13, marginTop: 1 },
  list: { padding: 16, gap: 12 },
  card: {
    borderRadius: 20,
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
  restaurant: { flexShrink: 1, fontSize: 18, fontWeight: "700" },
  feeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  feeText: { fontSize: 16, fontWeight: "700" },
  oldBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
  },
  oldBadgeText: { fontSize: 11, fontWeight: "700", color: "#dc2626" },
  errandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#fff3e0",
  },
  errandBadgeText: { fontSize: 10, fontWeight: "700", color: "#ea580c" },
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
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  acceptBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  empty: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 12,
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  goOnlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  goOnlineBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
