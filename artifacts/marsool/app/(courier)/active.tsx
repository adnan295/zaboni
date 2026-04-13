import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
} from "react-native";
import * as Location from "expo-location";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useCourier, CourierOrderStatus, CourierDeliveryStatus } from "@/context/CourierContext";
import { customFetch } from "@workspace/api-client-react";
import { CourierMap } from "@/components/CourierMap";

const STATUS_COLORS: Record<CourierOrderStatus, string> = {
  searching: "#9E9E9E",
  accepted: "#DC2626",
  picked_up: "#9C27B0",
  on_way: "#2196F3",
  delivered: "#4CAF50",
};

type StepDef = {
  status: CourierOrderStatus;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  nextStatus?: CourierDeliveryStatus;
  nextLabel?: string;
};

const STEPS: StepDef[] = [
  {
    status: "accepted",
    label: "courier.active.status.accepted",
    icon: "check-circle",
    nextStatus: "picked_up",
    nextLabel: "courier.active.markPickedUp",
  },
  {
    status: "picked_up",
    label: "courier.active.status.picked_up",
    icon: "inventory",
    nextStatus: "on_way",
    nextLabel: "courier.active.markOnWay",
  },
  {
    status: "on_way",
    label: "courier.active.status.on_way",
    icon: "delivery-dining",
    nextStatus: "delivered",
    nextLabel: "courier.active.markDelivered",
  },
  {
    status: "delivered",
    label: "courier.active.status.delivered",
    icon: "done-all",
  },
];

interface CourierCoord {
  latitude: number;
  longitude: number;
}

export default function ActiveOrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { activeOrders, updateDeliveryStatus, refreshActiveOrders, refreshAvailableOrders } = useCourier();
  const [updating, setUpdating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [courierLocation, setCourierLocation] = useState<CourierCoord | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationPermGrantedRef = useRef<boolean | null>(null);

  const order = activeOrders[0] ?? null;

  useEffect(() => {
    if (Platform.OS === "web" || !order) return;

    let cancelled = false;

    const fetchLocation = async () => {
      try {
        if (locationPermGrantedRef.current === null) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          locationPermGrantedRef.current = status === "granted";
        }
        if (!locationPermGrantedRef.current || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCourierLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {
      }
    };

    fetchLocation();

    locationIntervalRef.current = setInterval(fetchLocation, 10000);

    return () => {
      cancelled = true;
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [order?.id]);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const currentStepIndex = STEPS.findIndex((s) => s.status === order?.status);
  const currentStep = STEPS[currentStepIndex];

  const handleCancelOrder = () => {
    if (!order) return;
    Alert.alert(
      t("courier.active.cancelConfirm.title"),
      t("courier.active.cancelConfirm.body"),
      [
        { text: t("courier.active.cancelConfirm.cancel"), style: "cancel" },
        {
          text: t("courier.active.cancelConfirm.confirm"),
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              await customFetch(`/api/courier/orders/${order.id}/cancel`, { method: "POST" });
              await Promise.all([refreshActiveOrders(), refreshAvailableOrders()]);
            } catch {
              Alert.alert(t("courier.active.cancelConfirm.errorTitle"), t("courier.active.cancelConfirm.errorMsg"));
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const doStatusUpdate = async (status: CourierDeliveryStatus) => {
    if (!order) return;
    const orderId = order.id;
    setUpdating(true);
    try {
      await updateDeliveryStatus(orderId, status);
      if (status === "delivered") {
        router.push(`/(courier)/rate-customer?orderId=${orderId}`);
        await Promise.all([refreshActiveOrders(), refreshAvailableOrders()]);
      }
    } catch {
      Alert.alert(t("common.error"), t("common.retry"));
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusUpdate = (status: CourierDeliveryStatus) => {
    if (status === "delivered") {
      Alert.alert(
        t("courier.active.deliverConfirm.title"),
        t("courier.active.deliverConfirm.body"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("courier.active.deliverConfirm.confirm"),
            style: "default",
            onPress: () => doStatusUpdate(status),
          },
        ]
      );
    } else {
      doStatusUpdate(status);
    }
  };

  const openChat = () => {
    if (!order) return;
    router.push(`/chat/${order.id}`);
  };

  const openNavigation = () => {
    if (!order) return;
    const lat = order.destinationLat;
    const lon = order.destinationLon;
    const label = encodeURIComponent(order.address || "وجهة التوصيل");
    const addressEnc = encodeURIComponent(order.address || "Homs, Syria");

    const googleWebUrl = lat && lon
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${addressEnc}&travelmode=driving`;

    if (Platform.OS === "web") {
      Linking.openURL(googleWebUrl);
    } else if (Platform.OS === "ios") {
      const appleUrl = lat && lon
        ? `maps://maps.apple.com/?daddr=${lat},${lon}&q=${label}&dirflg=d`
        : `maps://maps.apple.com/?daddr=${addressEnc}&dirflg=d`;
      Linking.canOpenURL("maps://").then((ok) => {
        Linking.openURL(ok ? appleUrl : googleWebUrl);
      });
    } else {
      const deepLink = lat && lon ? `google.navigation:q=${lat},${lon}&mode=d` : null;
      if (deepLink) {
        Linking.canOpenURL(deepLink).then((ok) => {
          Linking.openURL(ok ? deepLink : googleWebUrl);
        }).catch(() => Linking.openURL(googleWebUrl));
      } else {
        Linking.openURL(googleWebUrl);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
        <MaterialIcons name="local-shipping" size={24} color="#fff" />
        <Text style={styles.headerTitle}>{t("courier.active.title")}</Text>
      </View>

      {!order ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="check-circle-outline" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {t("courier.active.noActive.title")}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {t("courier.active.noActive.body")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Stepper */}
          <View style={[styles.stepperCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isActive = idx === currentStepIndex;
              const stepColor = isActive
                ? STATUS_COLORS[step.status]
                : isCompleted
                ? "#4CAF50"
                : colors.border;
              return (
                <View key={step.status} style={styles.stepRow}>
                  <View style={styles.stepLeft}>
                    <View
                      style={[
                        styles.stepCircle,
                        {
                          backgroundColor: isActive
                            ? STATUS_COLORS[step.status] + "20"
                            : isCompleted
                            ? "#4CAF5020"
                            : colors.secondary,
                          borderColor: stepColor,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={isCompleted ? "check" : step.icon}
                        size={18}
                        color={stepColor}
                      />
                    </View>
                    {idx < STEPS.length - 1 && (
                      <View
                        style={[
                          styles.stepLine,
                          { backgroundColor: idx < currentStepIndex ? "#4CAF50" : colors.border },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      {
                        color: isActive
                          ? STATUS_COLORS[step.status]
                          : isCompleted
                          ? "#4CAF50"
                          : colors.mutedForeground,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {t(step.label)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Map */}
          {order.destinationLat && order.destinationLon ? (
            <View style={[styles.mapCard, { borderColor: colors.border }]}>
              <CourierMap
                destinationLat={order.destinationLat}
                destinationLon={order.destinationLon}
                courierLat={courierLocation?.latitude}
                courierLon={courierLocation?.longitude}
                address={order.address}
                onNavigate={openNavigation}
              />
              <TouchableOpacity
                style={styles.mapNavigateBtn}
                onPress={openNavigation}
                activeOpacity={0.85}
              >
                <MaterialIcons name="navigation" size={16} color="#fff" />
                <Text style={styles.mapNavigateBtnText}>ابدأ الملاحة</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Order details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {order.restaurantName ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="restaurant" size={18} color={colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                    {t("courier.available.restaurant")}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>
                    {order.restaurantName}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <MaterialIcons name="notes" size={18} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                  {t("courier.active.orderText")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {order.orderText}
                </Text>
              </View>
            </View>

            {order.address ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="location-on" size={18} color={colors.primary} />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                      {t("courier.active.address")}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>
                      {order.address}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {order.deliveryFee != null && order.deliveryFee > 0 ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.infoRow}>
                  <MaterialIcons name="account-balance-wallet" size={18} color="#ea580c" />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                      رسوم التوصيل
                    </Text>
                    <Text style={[styles.infoValue, { color: "#ea580c", fontWeight: "800" }]}>
                      {order.deliveryFee.toLocaleString("ar-SY")} ل.س
                    </Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.chatBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={openChat}
              activeOpacity={0.8}
            >
              <MaterialIcons name="chat" size={20} color={colors.primary} />
              <Text style={[styles.chatBtnText, { color: colors.primary }]}>
                {t("courier.active.openChat")}
              </Text>
            </TouchableOpacity>

            {(order.destinationLat && order.destinationLon) || order.address ? (
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: "#1a73e8" }]}
                onPress={openNavigation}
                activeOpacity={0.8}
              >
                <MaterialIcons name="navigation" size={20} color="#fff" />
                <Text style={styles.navBtnText}>{t("courier.active.navigate")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Cancel button — only before delivery */}
          {order.status !== "delivered" ? (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: "#ef4444" }]}
              onPress={handleCancelOrder}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              <MaterialIcons name="cancel" size={18} color="#ef4444" />
              <Text style={styles.cancelBtnText}>
                {cancelling ? "جاري الإلغاء..." : "إلغاء الطلب"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Action button */}
          {currentStep?.nextStatus ? (
            <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>
                {t("courier.active.statusTitle")}
              </Text>
              <TouchableOpacity
                style={[
                  styles.statusBtn,
                  { backgroundColor: STATUS_COLORS[currentStep.nextStatus] },
                ]}
                onPress={() => handleStatusUpdate(currentStep.nextStatus!)}
                disabled={updating}
                activeOpacity={0.8}
              >
                <Text style={styles.statusBtnText}>
                  {updating
                    ? t("courier.active.updating")
                    : t(currentStep.nextLabel ?? "courier.active.updateStatus")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
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
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center" },
  stepperCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 48 },
  stepLeft: { alignItems: "center", width: 36 },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: { width: 2, flex: 1, minHeight: 12 },
  stepLabel: { flex: 1, fontSize: 15, paddingTop: 8 },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  infoContent: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, lineHeight: 22 },
  divider: { height: 1, marginHorizontal: 16 },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
  },
  chatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  chatBtnText: { fontSize: 15, fontWeight: "700" },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  navBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  statusCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  statusTitle: { fontSize: 16, fontWeight: "700" },
  statusBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  statusBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "#fff5f5",
  },
  cancelBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  mapCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  map: {
    width: "100%",
    height: 200,
  },
  mapFallback: {
    width: "100%",
    height: 180,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mapFallbackText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  mapFallbackSub: { fontSize: 12, color: "#DC2626", fontWeight: "600" },
  mapNavigateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1a73e8",
    paddingVertical: 12,
  },
  mapNavigateBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
