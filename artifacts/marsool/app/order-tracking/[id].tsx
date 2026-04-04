import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useOrders, OrderStatus } from "@/context/OrderContext";
import { useRatings } from "@/context/RatingsContext";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

const STATUS_STEPS: { status: OrderStatus; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { status: "pending", label: "تم استلام الطلب", icon: "receipt" },
  { status: "confirmed", label: "تم تأكيد الطلب", icon: "check-circle" },
  { status: "preparing", label: "جاري التحضير", icon: "restaurant" },
  { status: "on_way", label: "المندوب في الطريق", icon: "delivery-dining" },
  { status: "delivered", label: "تم التوصيل", icon: "home" },
];

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getOrder } = useOrders();
  const { hasRated } = useRatings();
  const [, forceUpdate] = useState(0);
  const prevStatus = useRef<OrderStatus | null>(null);
  const deliveredHapticFired = useRef(false);
  const ratePromptShown = useRef(false);
  const ratePromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const order = getOrder(id ?? "");
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (!order) return;
    const current = order.status;
    if (prevStatus.current !== current) {
      if (prevStatus.current !== null) {
        if (current === "delivered") {
          if (!deliveredHapticFired.current) {
            deliveredHapticFired.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Animated.spring(celebrateScale, {
              toValue: 1,
              tension: 60,
              friction: 8,
              useNativeDriver: USE_NATIVE_DRIVER,
            }).start();
          }
          if (!ratePromptShown.current && !hasRated(order.id)) {
            ratePromptShown.current = true;
            ratePromptTimer.current = setTimeout(() => {
              ratePromptTimer.current = null;
              router.push({
                pathname: "/rate-order",
                params: { orderId: order.id, restaurantName: order.restaurantName },
              });
            }, 2000);
          }
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
      prevStatus.current = current;
    }
    return () => {
      if (ratePromptTimer.current) {
        clearTimeout(ratePromptTimer.current);
        ratePromptTimer.current = null;
      }
    };
  }, [order?.status, order?.id, order?.restaurantName, hasRated, router, celebrateScale]);

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.foreground }}>الطلب غير موجود</Text>
      </View>
    );
  }

  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.status === order.status);
  const isDelivered = order.status === "delivered";
  const rated = hasRated(order.id);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/(tabs)")}
        >
          <MaterialIcons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تتبع الطلب</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}>
        {/* ETA / Delivered Card */}
        <View style={[styles.etaCard, { backgroundColor: colors.primary }]}>
          {isDelivered ? (
            <>
              <Animated.View style={{ transform: [{ scale: celebrateScale }] }}>
                <MaterialIcons name="check-circle" size={56} color="#fff" />
              </Animated.View>
              <Text style={styles.etaTitle}>تم التوصيل!</Text>
              <Text style={styles.etaSubtitle}>نتمنى أن يعجبك الطلب، بالعافية</Text>
            </>
          ) : (
            <>
              <Text style={styles.etaTime}>{order.estimatedMinutes}</Text>
              <Text style={styles.etaUnit}>دقيقة</Text>
              <Text style={styles.etaSubtitle}>الوقت المتوقع للوصول</Text>
            </>
          )}
        </View>

        {/* Status Steps */}
        <View style={[styles.stepsCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>حالة الطلب</Text>
          {STATUS_STEPS.map((step, idx) => {
            const isDone = idx <= currentStepIdx;
            const isActive = idx === currentStepIdx;
            return (
              <View key={step.status} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  <View
                    style={[
                      styles.stepIcon,
                      { backgroundColor: isDone ? colors.primary : colors.muted },
                    ]}
                  >
                    <MaterialIcons
                      name={step.icon}
                      size={18}
                      color={isDone ? "#fff" : colors.mutedForeground}
                    />
                  </View>
                  {idx < STATUS_STEPS.length - 1 && (
                    <View
                      style={[
                        styles.stepLine,
                        { backgroundColor: idx < currentStepIdx ? colors.primary : colors.border },
                      ]}
                    />
                  )}
                </View>
                <View style={styles.stepContent}>
                  <Text
                    style={[
                      styles.stepLabel,
                      {
                        color: isActive ? colors.primary : isDone ? colors.foreground : colors.mutedForeground,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {step.label}
                  </Text>
                  {isActive && !isDelivered && (
                    <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Order Summary */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>تفاصيل الطلب</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.restaurant, { color: colors.foreground }]}>{order.restaurantName}</Text>
          {order.items.map((item) => (
            <View key={item.id} style={styles.orderItem}>
              <Text style={[styles.itemQty, { color: colors.primary }]}>×{item.quantity}</Text>
              <Text style={[styles.itemName, { color: colors.foreground }]}>{item.nameAr}</Text>
              <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
                {item.price * item.quantity} ر.س
              </Text>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>الإجمالي</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{order.totalPrice} ر.س</Text>
          </View>
        </View>

        {/* Delivery Address */}
        <View style={[styles.addressCard, { backgroundColor: colors.card }]}>
          <MaterialIcons name="location-on" size={20} color={colors.primary} />
          <View style={styles.addrInfo}>
            <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>عنوان التوصيل</Text>
            <Text style={[styles.addrText, { color: colors.foreground }]}>{order.address}</Text>
          </View>
        </View>

        {isDelivered && (
          <View style={styles.deliveredActions}>
            {!rated && (
              <TouchableOpacity
                style={[styles.rateBtn, { backgroundColor: colors.primary }]}
                onPress={() =>
                  router.push({
                    pathname: "/rate-order",
                    params: { orderId: order.id, restaurantName: order.restaurantName },
                  })
                }
              >
                <MaterialIcons name="star" size={20} color="#fff" />
                <Text style={styles.rateBtnText}>قيّم تجربتك</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.reorderBtn, { backgroundColor: rated ? colors.primary : colors.secondary }]}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={[styles.reorderText, { color: rated ? "#fff" : colors.primary }]}>
                اطلب مجدداً
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#fff" },
  etaCard: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 4,
  },
  etaTime: { fontSize: 64, fontWeight: "900", color: "#fff", lineHeight: 72 },
  etaUnit: { fontSize: 18, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  etaTitle: { fontSize: 28, fontWeight: "800", color: "#fff", marginTop: 8 },
  etaSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  stepsCard: {
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 16 },
  stepRow: { flexDirection: "row", gap: 12, minHeight: 56 },
  stepLeft: { alignItems: "center", width: 36 },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: { width: 2, flex: 1, marginVertical: 4 },
  stepContent: {
    flex: 1,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepLabel: { fontSize: 14 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  divider: { height: 1, marginVertical: 4 },
  restaurant: { fontSize: 15, fontWeight: "700" },
  orderItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemQty: { fontSize: 14, fontWeight: "700", width: 28 },
  itemName: { flex: 1, fontSize: 13 },
  itemPrice: { fontSize: 13 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 15, fontWeight: "600" },
  totalValue: { fontSize: 17, fontWeight: "800" },
  addressCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  addrInfo: { flex: 1, gap: 3 },
  addrLabel: { fontSize: 12 },
  addrText: { fontSize: 14, fontWeight: "500" },
  deliveredActions: {
    marginHorizontal: 16,
    marginTop: 8,
    gap: 12,
  },
  rateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
  },
  rateBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  reorderBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  reorderText: { fontSize: 16, fontWeight: "700" },
});
