import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useOrders, OrderStatus } from "@/context/OrderContext";
import { useRatings } from "@/context/RatingsContext";
import { DeliveryMap } from "@/components/DeliveryMap";
import {
  Coords,
  RIYADH_CENTER,
  simulateCourierStart,
  interpolateCoords,
  haversineDistance,
  estimateEtaMinutes,
} from "@/utils/geo";

const USE_NATIVE_DRIVER = Platform.OS !== "web";
const SIMULATION_DURATION_MS = 7 * 60 * 1000;
const SIMULATION_STEP_MS = 3000;

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { getOrder } = useOrders();
  const { hasRated, ratingsLoaded } = useRatings();
  const [, forceUpdate] = useState(0);

  const order = getOrder(id ?? "");
  const initialOrder = order;
  const isAlreadyDelivered = order?.status === "delivered";
  const prevStatus = useRef<OrderStatus | null>(null);
  const deliveredHapticFired = useRef(isAlreadyDelivered);
  const ratePromptShown = useRef(false);
  const ratePromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrateScale = useRef(new Animated.Value(isAlreadyDelivered ? 1 : 0)).current;
  const searchingRotate = useRef(new Animated.Value(0)).current;
  const searchingPulse = useRef(new Animated.Value(1)).current;
  const initialAccepted = initialOrder?.status === "accepted" || initialOrder?.status === "on_way" || initialOrder?.status === "delivered";
  const acceptedScale = useRef(new Animated.Value(initialAccepted ? 1 : 0)).current;

  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [courierCoords, setCourierCoords] = useState<Coords | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulationStartRef = useRef<number>(0);
  const courierStartRef = useRef<Coords | null>(null);

  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } else {
          setUserCoords(RIYADH_CENTER);
        }
      } catch {
        setUserCoords(RIYADH_CENTER);
      }
    })();
  }, []);

  const simulationInitialized = useRef(false);

  useEffect(() => {
    if (!userCoords) return;
    const currentOrder = getOrder(id ?? "");
    if (!currentOrder || currentOrder.status === "searching" || currentOrder.status === "delivered") return;
    if (simulationInitialized.current) return;

    simulationInitialized.current = true;
    if (!courierStartRef.current) {
      courierStartRef.current = simulateCourierStart(userCoords, currentOrder.status === "on_way" ? 1.2 : 2);
    }
    setCourierCoords(courierStartRef.current);
    const startDist = haversineDistance(courierStartRef.current, userCoords);
    setEtaMinutes(estimateEtaMinutes(startDist));
    simulationStartRef.current = Date.now();

    simulationRef.current = setInterval(() => {
      const elapsed = Date.now() - simulationStartRef.current;
      const t = Math.min(1, elapsed / SIMULATION_DURATION_MS);
      const currentCourier = interpolateCoords(courierStartRef.current!, userCoords, t);
      setCourierCoords(currentCourier);
      const dist = haversineDistance(currentCourier, userCoords);
      setEtaMinutes(estimateEtaMinutes(dist));
      if (t >= 1 && simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
    }, SIMULATION_STEP_MS);
  }, [userCoords, id, order?.status]);

  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(searchingRotate, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(searchingPulse, { toValue: 1.15, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(searchingPulse, { toValue: 1, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    spin.start();
    pulse.start();
    return () => { spin.stop(); pulse.stop(); };
  }, []);

  useEffect(() => {
    const latestOrder = getOrder(id ?? "");
    if (
      ratingsLoaded &&
      isAlreadyDelivered &&
      latestOrder &&
      !hasRated(latestOrder.id) &&
      !ratePromptShown.current
    ) {
      ratePromptShown.current = true;
      ratePromptTimer.current = setTimeout(() => {
        ratePromptTimer.current = null;
        router.push({ pathname: "/rate-order", params: { orderId: latestOrder.id, restaurantName: latestOrder.restaurantName } });
      }, 800);
    }
    return () => {
      if (ratePromptTimer.current) { clearTimeout(ratePromptTimer.current); ratePromptTimer.current = null; }
    };
  }, [ratingsLoaded]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (!order) return;
    const current = order.status;
    if (prevStatus.current !== current) {
      if (prevStatus.current !== null) {
        if (current === "accepted") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.spring(acceptedScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: USE_NATIVE_DRIVER }).start();
          setTimeout(() => {
            router.push({ pathname: "/chat/[orderId]", params: { orderId: order.id } });
          }, 1200);
        } else if (current === "delivered") {
          if (!deliveredHapticFired.current) {
            deliveredHapticFired.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Animated.spring(celebrateScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: USE_NATIVE_DRIVER }).start();
          }
          if (!ratePromptShown.current && !hasRated(order.id)) {
            ratePromptShown.current = true;
            ratePromptTimer.current = setTimeout(() => {
              ratePromptTimer.current = null;
              router.push({ pathname: "/rate-order", params: { orderId: order.id, restaurantName: order.restaurantName } });
            }, 2000);
          }
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
      prevStatus.current = current;
    }
    return () => {
      if (ratePromptTimer.current) { clearTimeout(ratePromptTimer.current); ratePromptTimer.current = null; }
    };
  }, [order?.status]);

  const spinInterpolate = searchingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.foreground }}>{t("orderTracking.notFound")}</Text>
      </View>
    );
  }

  const isDelivered = order.status === "delivered";
  const isOnWay = order.status === "on_way";
  const isAccepted = order.status === "accepted";
  const isSearching = order.status === "searching";
  const rated = hasRated(order.id);
  const showMap = !isSearching && !isDelivered;

  const getStatusTitle = () => {
    if (isSearching) return t("orderTracking.status.searching");
    if (isAccepted) return t("orderTracking.status.accepted");
    if (isOnWay) return t("orderTracking.status.on_way");
    return t("orderTracking.status.delivered");
  };

  const STATUS_STEPS: { key: OrderStatus; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { key: "accepted", label: t("orderTracking.statusSteps.accepted"), icon: "check-circle" },
    { key: "on_way", label: t("orderTracking.statusSteps.on_way"), icon: "delivery-dining" },
    { key: "delivered", label: t("orderTracking.statusSteps.delivered"), icon: "home" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/(tabs)")}>
          <MaterialIcons name={backIcon} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getStatusTitle()}</Text>
        <View style={{ width: 40 }} />
      </View>

      {showMap && (
        <View style={styles.mapSection}>
          <DeliveryMap
            userCoords={userCoords}
            courierCoords={courierCoords}
            isSearching={isSearching}
            etaMinutes={etaMinutes}
            height={220}
          />
          {etaMinutes && !isDelivered && (
            <View style={[styles.etaBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
              <MaterialIcons name="access-time" size={16} color={colors.primary} />
              <Text style={[styles.etaBarText, { color: colors.foreground }]}>
                {t("orderTracking.eta", { minutes: etaMinutes })}
              </Text>
              <View style={[styles.etaBadge, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.etaBadgeText, { color: colors.primary }]}>
                  {isOnWay ? t("orderTracking.onWayLabel") : t("orderTracking.comingLabel")}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding + 24 }}>

        {isSearching && (
          <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
            <Animated.View style={{ transform: [{ scale: searchingPulse }] }}>
              <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
                <MaterialIcons name="delivery-dining" size={72} color="#fff" />
              </Animated.View>
            </Animated.View>
            <Text style={styles.heroTitle}>{t("orderTracking.searching.title")}</Text>
            <Text style={styles.heroSub}>{t("orderTracking.searching.sub")}</Text>
            <View style={styles.dotRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, { backgroundColor: "rgba(255,255,255,0.5)" }]} />
              ))}
            </View>
          </View>
        )}

        {!isSearching && (
          <>
            <Animated.View style={[styles.courierCard, { backgroundColor: colors.card }, isAccepted && { transform: [{ scale: acceptedScale }] }]}>
              {isAccepted && (
                <View style={[styles.acceptedBanner, { backgroundColor: "#22c55e" }]}>
                  <MaterialIcons name="check-circle" size={16} color="#fff" />
                  <Text style={styles.acceptedBannerText}>{t("orderTracking.courier.acceptedBanner")}</Text>
                </View>
              )}
              <View style={styles.courierRow}>
                <View style={[styles.courierAvatar, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="delivery-dining" size={32} color="#fff" />
                </View>
                <View style={styles.courierInfo}>
                  <Text style={[styles.courierName, { color: colors.foreground }]}>{order.courierName}</Text>
                  <Text style={[styles.courierPhone, { color: colors.mutedForeground }]}>{order.courierPhone}</Text>
                  <View style={styles.courierRatingRow}>
                    <MaterialIcons name="star" size={14} color="#FFB800" />
                    <Text style={[styles.courierRatingText, { color: colors.foreground }]}>{order.courierRating}</Text>
                    <Text style={[styles.courierRatingLabel, { color: colors.mutedForeground }]}>{t("orders.courier")}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.chatBtn, { backgroundColor: colors.primary }]}
                onPress={() =>
                  router.push({ pathname: "/chat/[orderId]", params: { orderId: order.id } })
                }
              >
                <MaterialIcons name="chat" size={20} color="#fff" />
                <Text style={styles.chatBtnText}>{t("orderTracking.courier.openChat")}</Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t("orderTracking.orderTitle")}</Text>
              {STATUS_STEPS.map((step, idx, arr) => {
                const statusOrder: OrderStatus[] = ["accepted", "on_way", "delivered"];
                const currentIdx = statusOrder.indexOf(order.status);
                const stepIdx = statusOrder.indexOf(step.key);
                const isDone = stepIdx <= currentIdx;
                const isActive = stepIdx === currentIdx;
                return (
                  <View key={step.key} style={styles.stepRow}>
                    <View style={styles.stepLeft}>
                      <View style={[styles.stepIcon, { backgroundColor: isDone ? colors.primary : colors.muted }]}>
                        <MaterialIcons name={step.icon} size={18} color={isDone ? "#fff" : colors.mutedForeground} />
                      </View>
                      {idx < arr.length - 1 && (
                        <View style={[styles.stepLine, { backgroundColor: stepIdx < currentIdx ? colors.primary : colors.border }]} />
                      )}
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={[styles.stepLabel, { color: isActive ? colors.primary : isDone ? colors.foreground : colors.mutedForeground, fontWeight: isActive ? "700" : "500" }]}>
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
          </>
        )}

        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t("orderTracking.summary.title")}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.restaurantLabel, { color: colors.mutedForeground }]}>{order.restaurantName}</Text>
          <Text style={[styles.orderText, { color: colors.foreground }]}>{order.orderText}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.addrRow}>
            <MaterialIcons name="location-on" size={16} color={colors.primary} />
            <Text style={[styles.addrText, { color: colors.foreground }]}>{order.address}</Text>
          </View>
        </View>

        {isDelivered && (
          <View style={styles.deliveredActions}>
            {!rated && (
              <TouchableOpacity
                style={[styles.rateBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push({ pathname: "/rate-order", params: { orderId: order.id, restaurantName: order.restaurantName } })}
              >
                <MaterialIcons name="star" size={20} color="#fff" />
                <Text style={styles.rateBtnText}>{t("orderTracking.rate")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.reorderBtn, { backgroundColor: rated ? colors.primary : colors.secondary }]}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={[styles.reorderText, { color: rated ? "#fff" : colors.primary }]}>{t("orderTracking.reorder")}</Text>
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
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#fff" },
  mapSection: { overflow: "hidden" },
  etaBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  etaBarText: { flex: 1, fontSize: 14, fontWeight: "600" },
  etaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  etaBadgeText: { fontSize: 12, fontWeight: "700" },
  heroCard: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: "#fff", textAlign: "center" },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  dotRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  courierCard: {
    margin: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  acceptedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  acceptedBannerText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  courierRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  courierAvatar: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  courierInfo: { flex: 1, gap: 3 },
  courierName: { fontSize: 16, fontWeight: "800" },
  courierPhone: { fontSize: 13 },
  courierRatingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  courierRatingText: { fontSize: 13, fontWeight: "700" },
  courierRatingLabel: { fontSize: 11 },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 16,
    marginTop: 0,
    borderRadius: 14,
    paddingVertical: 14,
  },
  chatBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 12,
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
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stepLine: { width: 2, flex: 1, marginVertical: 4 },
  stepContent: { flex: 1, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
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
    gap: 10,
  },
  divider: { height: 1 },
  restaurantLabel: { fontSize: 12 },
  orderText: { fontSize: 15, lineHeight: 22, textAlign: "right" },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  addrText: { fontSize: 13, flex: 1 },
  deliveredActions: { marginHorizontal: 16, marginTop: 4, gap: 12 },
  rateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
  },
  rateBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  reorderBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  reorderText: { fontSize: 16, fontWeight: "700" },
});
