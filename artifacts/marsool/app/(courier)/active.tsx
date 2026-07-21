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
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
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

  const formatWaPhone = (phone: string) => phone.replace(/[^0-9]/g, "");

  const openWhatsApp = () => {
    if (!order) return;
    const phone = formatWaPhone(order.customerPhone ?? "");
    if (phone) Linking.openURL(`https://wa.me/${phone}`);
  };

  const callCustomer = () => {
    if (!order) return;
    const raw = order.customerPhone ?? "";
    const phone = raw.replace(/(?!^\+)[^0-9]/g, "");
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const sanitizedRestaurantPhone = (order?.restaurantPhone ?? "").replace(/(?!^\+)[^0-9]/g, "");

  const callRestaurant = () => {
    if (!sanitizedRestaurantPhone) return;
    Linking.canOpenURL(`tel:${sanitizedRestaurantPhone}`).then((supported) => {
      if (supported) {
        Linking.openURL(`tel:${sanitizedRestaurantPhone}`);
      }
    }).catch(() => {});
  };

  const whatsappRestaurant = () => {
    if (!order) return;
    const phone = formatWaPhone(order.restaurantPhone ?? "");
    if (phone) Linking.openURL(`https://wa.me/${phone}`);
  };

  // Open turn-by-turn navigation to an exact pin (lat/lon) when available,
  // falling back to a text query only if no coordinates exist. Passing
  // coordinates makes Google/Apple Maps go to the precise point instead of
  // geocoding free text (which lands on a wrong/approximate place).
  const openMapsTo = (
    lat: number | null | undefined,
    lon: number | null | undefined,
    fallbackText: string,
  ) => {
    const q = encodeURIComponent(fallbackText || "Homs, Syria");
    const hasCoords = lat != null && lon != null;
    const googleWebUrl = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;

    if (Platform.OS === "web") {
      Linking.openURL(googleWebUrl);
    } else if (Platform.OS === "ios") {
      const appleUrl = hasCoords
        ? `maps://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`
        : `maps://maps.apple.com/?daddr=${q}&dirflg=d`;
      Linking.canOpenURL("maps://").then((ok) => {
        Linking.openURL(ok ? appleUrl : googleWebUrl);
      });
    } else {
      const deepLink = hasCoords ? `google.navigation:q=${lat},${lon}&mode=d` : null;
      if (deepLink) {
        Linking.canOpenURL(deepLink).then((ok) => {
          Linking.openURL(ok ? deepLink : googleWebUrl);
        }).catch(() => Linking.openURL(googleWebUrl));
      } else {
        Linking.openURL(googleWebUrl);
      }
    }
  };

  const openNavigation = () => {
    if (!order) return;
    openMapsTo(order.destinationLat, order.destinationLon, order.address || "وجهة التوصيل");
  };

  const navigateToRestaurant = () => {
    if (!order) return;
    openMapsTo(order.restaurantLat, order.restaurantLon, order.restaurantName || "المطعم");
  };

  // One stateful navigation control. Before the courier has picked up (status
  // "accepted") it routes to the restaurant to collect the order; once picked up
  // it routes to the customer to deliver. Errand orders have no restaurant, so
  // they always route to the customer.
  const navigatesToRestaurant = !!order && order.status === "accepted" && order.orderType !== "errand";
  const handleNavigate = () => {
    if (!order) return;
    if (navigatesToRestaurant) navigateToRestaurant();
    else openNavigation();
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
                onNavigate={handleNavigate}
              />
              <TouchableOpacity
                style={styles.mapNavigateBtn}
                onPress={handleNavigate}
                activeOpacity={0.85}
              >
                <MaterialIcons name="navigation" size={16} color="#fff" />
                <Text style={styles.mapNavigateBtnText}>
                  {navigatesToRestaurant ? t("courier.active.toRestaurant") : t("courier.active.toCustomer")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Order details */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {order.orderType === "errand" ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="shopping-bag" size={18} color="#ea580c" />
                <View style={styles.infoContent}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
                      مطلوب من
                    </Text>
                    <View style={styles.errandBadge}>
                      <Text style={styles.errandBadgeText}>مندوب متجول</Text>
                    </View>
                  </View>
                  <Text style={[styles.infoValue, { color: "#ea580c", fontWeight: "800" }]}>
                    {order.placeName ?? "—"}
                  </Text>
                </View>
              </View>
            ) : order.restaurantName ? (
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

            {(() => {
              const typedOrder = order as typeof order & { items?: { id: string; nameAr: string; qty: number; unitPrice: number; lineTotal: number; note?: string | null; options?: { nameAr: string; extraPrice: number }[] }[]; restaurantNote?: string | null };
              const structuredItems = typedOrder.items ?? [];
              if (structuredItems.length > 0) {
                return (
                  <View style={styles.infoRow}>
                    <MaterialIcons name="receipt-long" size={18} color={colors.primary} />
                    <View style={[styles.infoContent, { gap: 6 }]}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>تفاصيل الطلب</Text>
                      {structuredItems.map((it) => (
                        <View key={it.id}>
                          <Text style={[styles.infoValue, { color: colors.foreground }]}>
                            {it.nameAr} × {it.qty}
                            {"  "}
                            <Text style={{ color: colors.primary, fontWeight: "700" }}>{it.lineTotal.toLocaleString()} ل.س</Text>
                          </Text>
                          {(it.options ?? []).map((opt, i) => (
                            <Text key={i} style={[{ color: colors.mutedForeground, fontSize: 12, paddingRight: 12 }]}>
                              ↳ {opt.nameAr}{opt.extraPrice > 0 ? ` (+${opt.extraPrice.toLocaleString()})` : ""}
                            </Text>
                          ))}
                          {it.note ? (
                            <Text style={[{ color: colors.mutedForeground, fontSize: 12, paddingRight: 12 }]}>
                              📝 {it.note}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              }
              return (
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
              );
            })()}

            {(order as typeof order & { restaurantNote?: string | null }).restaurantNote ? (
              <View style={[styles.infoRow, { backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, marginTop: 4 }]}>
                <MaterialIcons name="sticky-note-2" size={18} color="#B45309" />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: "#B45309", fontWeight: "700" }]}>ملاحظة الزبون</Text>
                  <Text style={[styles.infoValue, { color: "#78350F" }]}>
                    {(order as typeof order & { restaurantNote?: string | null }).restaurantNote}
                  </Text>
                </View>
              </View>
            ) : null}

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
            {order.customerPhone ? (
              <TouchableOpacity
                style={[styles.callBtn, { backgroundColor: "#DC2626" }]}
                onPress={callCustomer}
                activeOpacity={0.8}
              >
                <MaterialIcons name="phone" size={20} color="#fff" />
                <Text style={styles.callBtnText}>{t("courier.active.call")}</Text>
              </TouchableOpacity>
            ) : null}

            {sanitizedRestaurantPhone ? (
              <TouchableOpacity
                style={[styles.callBtn, { backgroundColor: "#ea580c" }]}
                onPress={callRestaurant}
                activeOpacity={0.8}
              >
                <MaterialIcons name="restaurant" size={20} color="#fff" />
                <Text style={styles.callBtnText}>{t("courier.active.callRestaurant")}</Text>
              </TouchableOpacity>
            ) : null}

            {sanitizedRestaurantPhone ? (
              <TouchableOpacity
                style={[styles.chatBtn, { backgroundColor: "#25D366", borderColor: "#25D366" }]}
                onPress={whatsappRestaurant}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />
                <Text style={[styles.chatBtnText, { color: "#fff" }]}>
                  {t("courier.active.whatsappRestaurant")}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.chatBtn, { backgroundColor: "#25D366", borderColor: "#25D366" }]}
              onPress={openWhatsApp}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />
              <Text style={[styles.chatBtnText, { color: "#fff" }]}>
                {t("courier.active.whatsapp")}
              </Text>
            </TouchableOpacity>

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
  navChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "center",
  },
  navChipText: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, marginHorizontal: 16 },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  callBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
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
  errandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#fff3e0",
  },
  errandBadgeText: { fontSize: 10, fontWeight: "700", color: "#ea580c" },
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
