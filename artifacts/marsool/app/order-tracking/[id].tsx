import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Animated,
  Alert,
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
import { customFetch, ApiError } from "@workspace/api-client-react";
import { useRatings } from "@/context/RatingsContext";
import { DeliveryMap } from "@/components/DeliveryMap";
import {
  Coords,
  HOMS_CENTER,
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
  const { getOrder, refreshOrder } = useOrders();
  const { hasRated, ratingsLoaded } = useRatings();
  const [, forceUpdate] = useState(0);
  const [showChatPrompt, setShowChatPrompt] = useState(false);

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
  const [isPollingActive, setIsPollingActive] = useState(false);
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulationStartRef = useRef<number>(0);
  const courierStartRef = useRef<Coords | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gotRealGps = useRef(false);
  const simulationInitialized = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const TERMINAL = ["delivered", "cancelled"];
    if (!id || TERMINAL.includes(order?.status ?? "")) return;

    const poll = () => { void refreshOrder(id); };
    poll();
    statusPollRef.current = setInterval(poll, 5000);

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [id, order?.status]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } else {
          setUserCoords(HOMS_CENTER);
        }
      } catch {
        setUserCoords(HOMS_CENTER);
      }
    })();
  }, []);

  const startSimulation = useCallback((userPos: Coords, currentStatus: string) => {
    if (simulationRef.current || simulationInitialized.current) return;
    simulationInitialized.current = true;
    if (!courierStartRef.current) {
      courierStartRef.current = simulateCourierStart(userPos, (currentStatus === "on_way" || currentStatus === "picked_up") ? 1.2 : 2);
    }
    setCourierCoords(courierStartRef.current);
    const startDist = haversineDistance(courierStartRef.current, userPos);
    setEtaMinutes(estimateEtaMinutes(startDist));
    simulationStartRef.current = Date.now();

    simulationRef.current = setInterval(() => {
      const elapsed = Date.now() - simulationStartRef.current;
      const progress = Math.min(1, elapsed / SIMULATION_DURATION_MS);
      const currentCourier = interpolateCoords(courierStartRef.current!, userPos, progress);
      setCourierCoords(currentCourier);
      const dist = haversineDistance(currentCourier, userPos);
      setEtaMinutes(estimateEtaMinutes(dist));
      if (progress >= 1 && simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
    }, SIMULATION_STEP_MS);
  }, []);

  const stopSimulation = useCallback(() => {
    if (simulationRef.current) {
      clearInterval(simulationRef.current);
      simulationRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!userCoords) return;
    const currentOrder = getOrder(id ?? "");
    if (!currentOrder || currentOrder.status === "searching" || currentOrder.status === "delivered" || currentOrder.status === "cancelled") return;

    const ACTIVE_STATUSES = ["accepted", "picked_up", "on_way"];
    if (!ACTIVE_STATUSES.includes(currentOrder.status)) return;

    if (pollingRef.current) return;

    setIsPollingActive(true);

    const pollLocation = async () => {
      try {
        const data = await customFetch(`/api/orders/${id}/courier-location`) as { lat: number; lon: number; updatedAt?: string };
        if (data?.lat != null && data?.lon != null) {
          const realCoords: Coords = { latitude: data.lat, longitude: data.lon };
          if (!gotRealGps.current) {
            gotRealGps.current = true;
            stopSimulation();
          }
          setCourierCoords(realCoords);
          const dist = haversineDistance(realCoords, userCoords);
          setEtaMinutes(estimateEtaMinutes(dist));
        }
      } catch {
      }
    };

    void pollLocation();
    pollingRef.current = setInterval(pollLocation, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setIsPollingActive(false);
    };
  }, [userCoords, id, order?.status]);

  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
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

  const [cancelling, setCancelling] = useState(false);

  const handleCancelOrder = () => {
    Alert.alert(
      t("orderTracking.cancelOrder.confirmTitle"),
      t("orderTracking.cancelOrder.confirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("orderTracking.cancelOrder.confirm"),
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              await customFetch(`/api/orders/${id}`, { method: "DELETE" });
              router.replace("/(tabs)");
            } catch (err: unknown) {
              if (err instanceof ApiError && err.status === 409) {
                Alert.alert(
                  t("orderTracking.cancelOrder.alreadyAcceptedTitle"),
                  t("orderTracking.cancelOrder.alreadyAcceptedBody")
                );
                await refreshOrder(id ?? "");
              } else {
                Alert.alert(t("common.error"), t("common.retry"));
              }
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

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
          if (order.id) {
            router.push(`/chat/${order.id}`);
          } else {
            setShowChatPrompt(true);
          }
        } else if (current === "picked_up" || current === "on_way") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
          if (current === "searching") {
            setShowChatPrompt(false);
          }
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
  const isCancelled = order.status === "cancelled";
  const isOnWay = order.status === "on_way" || order.status === "picked_up";
  const isAccepted = order.status === "accepted";
  const isSearching = order.status === "searching";
  const rated = hasRated(order.id);
  const showMap = !isSearching && !isDelivered && !isCancelled;

  const getStatusTitle = () => {
    const statusKey = order.status as string;
    if (statusKey === "searching") return t("orderTracking.status.searching");
    if (statusKey === "accepted") return t("orderTracking.status.accepted");
    if (statusKey === "picked_up") return t("orderTracking.status.picked_up");
    if (statusKey === "on_way") return t("orderTracking.status.on_way");
    if (statusKey === "cancelled") return t("orders.status.cancelled");
    return t("orderTracking.status.delivered");
  };

  const STATUS_STEPS: { key: string; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { key: "accepted", label: t("orderTracking.statusSteps.accepted"), icon: "check-circle" },
    { key: "picked_up", label: t("orderTracking.status.picked_up"), icon: "inventory" },
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
          {isPollingActive && !courierCoords && !isDelivered && (
            <View style={[styles.etaBar, { backgroundColor: "#fffbeb", borderTopColor: "#fcd34d" }]}>
              <MaterialIcons name="location-searching" size={16} color="#d97706" />
              <Text style={[styles.etaBarText, { color: "#92400e" }]}>
                {t("orderTracking.waitingLocation")}
              </Text>
            </View>
          )}
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
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelOrder}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              <MaterialIcons name="cancel" size={18} color="#fff" />
              <Text style={styles.cancelBtnText}>
                {cancelling ? t("common.loading") : t("orderTracking.cancelOrder.btn")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isCancelled && (
          <View style={[styles.cancelledCard, { backgroundColor: "#FFF0F0", borderColor: "#FFCCCC" }]}>
            <MaterialIcons name="cancel" size={56} color="#EF4444" />
            <Text style={styles.cancelledTitle}>{t("orders.status.cancelled")}</Text>
            <Text style={[styles.cancelledSub, { color: colors.mutedForeground }]}>
              {t("orderTracking.cancelOrder.cancelledNote")}
            </Text>
            <TouchableOpacity
              style={[styles.reorderBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
              onPress={() => router.replace("/(tabs)")}
            >
              <Text style={[styles.reorderText, { color: "#fff" }]}>{t("orderTracking.reorder")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {showChatPrompt && !isCancelled && order && (
          <View style={[styles.chatPromptBanner, { backgroundColor: "#22c55e" }]}>
            <View style={styles.chatPromptContent}>
              <MaterialIcons name="check-circle" size={22} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.chatPromptTitle}>{t("orderTracking.courier.acceptedBanner")}</Text>
                <Text style={styles.chatPromptNote}>{t("orderTracking.courier.chatPromptNote")}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowChatPrompt(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.chatPromptActions}>
              <TouchableOpacity
                style={styles.chatPromptBtn}
                onPress={() => {
                  setShowChatPrompt(false);
                  router.push({ pathname: "/chat/[orderId]", params: { orderId: order.id } });
                }}
              >
                <MaterialIcons name="chat" size={16} color="#22c55e" />
                <Text style={styles.chatPromptBtnText}>{t("orderTracking.courier.chatPromptBtn")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chatPromptDismiss} onPress={() => setShowChatPrompt(false)}>
                <Text style={styles.chatPromptDismissText}>{t("orderTracking.courier.chatPromptDismiss")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!isSearching && !isCancelled && (
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
                const statusOrder: string[] = ["accepted", "picked_up", "on_way", "delivered"];
                const currentIdx = statusOrder.indexOf(order.status as string);
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

        {(isAccepted || isOnWay) && (
          <TouchableOpacity
            style={[styles.cannotCancelRow, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => Alert.alert(t("orderTracking.cancelOrder.alreadyAcceptedTitle"), t("orderTracking.cancelOrder.alreadyAcceptedBody"))}
            activeOpacity={0.7}
          >
            <MaterialIcons name="lock" size={16} color={colors.mutedForeground} />
            <Text style={[styles.cannotCancelText, { color: colors.mutedForeground }]}>
              {t("orderTracking.cancelOrder.cannotCancelNote")}
            </Text>
          </TouchableOpacity>
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
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.addrRow}>
            <MaterialIcons name="payments" size={16} color={colors.primary} />
            <Text style={[styles.addrText, { color: colors.foreground }]}>{t("payment.cashOnDelivery")}</Text>
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
  chatPromptBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  chatPromptContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  chatPromptTitle: { color: "#fff", fontWeight: "800", fontSize: 14 },
  chatPromptNote: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  chatPromptActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  chatPromptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 10,
  },
  chatPromptBtnText: { color: "#22c55e", fontWeight: "700", fontSize: 13 },
  chatPromptDismiss: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  chatPromptDismissText: { color: "rgba(255,255,255,0.85)", fontWeight: "600", fontSize: 13 },
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
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  cancelBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  cannotCancelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  cannotCancelText: { fontSize: 13, fontWeight: "500" },
  cancelledCard: {
    margin: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  cancelledTitle: { fontSize: 20, fontWeight: "800", color: "#EF4444", textAlign: "center" },
  cancelledSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
