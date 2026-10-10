import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import { default as Text } from "@/components/AppText";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  useCourierColors as useColors,
  CourierHeader,
} from "@/components/CourierUI";
import {
  useCourier,
  CourierOrderStatus,
  CourierDeliveryStatus,
} from "@/context/CourierContext";
import { customFetch } from "@workspace/api-client-react";
import { CourierMap } from "@/components/CourierMap";

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
  const {
    activeOrders,
    updateDeliveryStatus,
    refreshActiveOrders,
    refreshAvailableOrders,
    isLoadingActive,
    activeOrdersError,
  } = useCourier();
  const mutationRef = useRef(false);
  const [updating, setUpdating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [courierLocation, setCourierLocation] = useState<CourierCoord | null>(
    null,
  );
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const locationPermGrantedRef = useRef<boolean | null>(null);

  // Order stacking: a courier can hold up to 2 orders. The "current" one is the
  // most-advanced (on_way > picked_up > accepted) — the one to finish first — and
  // the rest wait in the queue. When the current is delivered the next takes over
  // and the map/nav automatically point at its restaurant.
  const STATUS_RANK: Record<string, number> = {
    on_way: 0,
    picked_up: 1,
    accepted: 2,
  };
  const sortedActive = [...activeOrders].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3),
  );
  const order = sortedActive[0] ?? null;
  const queuedOrders = sortedActive.slice(1);

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
          // Pushing to the server is handled centrally in CourierContext (runs
          // whenever the courier is online or delivering); here we only track
          // the position locally to render this screen's map.
        }
      } catch {}
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

  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const currentStepIndex = STEPS.findIndex((s) => s.status === order?.status);
  const currentStep = STEPS[currentStepIndex];

  const handleCancelOrder = () => {
    if (!order) return;
    Alert.alert(
      "الاعتذار عن التوصيل؟",
      "سيعود الطلب للبحث عن مندوب آخر. استخدم هذا الخيار فقط إذا تعذّر عليك الاستلام.",
      [
        { text: t("courier.active.cancelConfirm.cancel"), style: "cancel" },
        {
          text: "تأكيد الاعتذار",
          style: "destructive",
          onPress: async () => {
            if (mutationRef.current) return;
            mutationRef.current = true;
            setCancelling(true);
            try {
              await customFetch(`/api/courier/orders/${order.id}/cancel`, {
                method: "POST",
              });
              await Promise.all([
                refreshActiveOrders(),
                refreshAvailableOrders(),
              ]);
            } catch {
              Alert.alert(
                t("courier.active.cancelConfirm.errorTitle"),
                t("courier.active.cancelConfirm.errorMsg"),
              );
            } finally {
              mutationRef.current = false;
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  const doStatusUpdate = async (status: CourierDeliveryStatus) => {
    if (!order || mutationRef.current) return;
    mutationRef.current = true;
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
      mutationRef.current = false;
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
        ],
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

  const sanitizedRestaurantPhone = (order?.restaurantPhone ?? "").replace(
    /(?!^\+)[^0-9]/g,
    "",
  );

  const callRestaurant = () => {
    if (!sanitizedRestaurantPhone) return;
    Linking.canOpenURL(`tel:${sanitizedRestaurantPhone}`)
      .then((supported) => {
        if (supported) {
          Linking.openURL(`tel:${sanitizedRestaurantPhone}`);
        }
      })
      .catch(() => {});
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
      const deepLink = hasCoords
        ? `google.navigation:q=${lat},${lon}&mode=d`
        : null;
      if (deepLink) {
        Linking.canOpenURL(deepLink)
          .then((ok) => {
            Linking.openURL(ok ? deepLink : googleWebUrl);
          })
          .catch(() => Linking.openURL(googleWebUrl));
      } else {
        Linking.openURL(googleWebUrl);
      }
    }
  };

  const openNavigation = () => {
    if (!order) return;
    openMapsTo(
      order.destinationLat,
      order.destinationLon,
      order.address || "وجهة التوصيل",
    );
  };

  const navigateToRestaurant = () => {
    if (!order) return;
    if (order.orderType === "errand") {
      if (order.placeName) openMapsTo(null, null, order.placeName);
      else
        Alert.alert(
          "مكان الاستلام غير محدد",
          "اتصل بالزبون لتحديد مكان استلام الطلب.",
        );
      return;
    }
    openMapsTo(
      order.restaurantLat,
      order.restaurantLon,
      order.restaurantName || "المطعم",
    );
  };

  // One stateful navigation control. Before the courier has picked up (status
  // "accepted") it routes to pickup; once picked up it routes to the customer.
  // Errand orders have no restaurant coordinates, so
  // pickup uses the supplied place name when coordinates are unavailable.
  const navigatesToRestaurant = !!order && order.status === "accepted";
  const handleNavigate = () => {
    if (!order) return;
    if (navigatesToRestaurant) navigateToRestaurant();
    else openNavigation();
  };

  // The in-app map points wherever the nav button does: the restaurant while the
  // order still needs pickup, the customer once picked up. So when the current
  // order is delivered and the next (accepted) one takes over, the map switches
  // to that restaurant automatically.
  const mapTargetLat = navigatesToRestaurant
    ? ((order?.orderType === "errand" ? null : order?.restaurantLat) ?? null)
    : (order?.destinationLat ?? null);
  const mapTargetLon = navigatesToRestaurant
    ? ((order?.orderType === "errand" ? null : order?.restaurantLon) ?? null)
    : (order?.destinationLon ?? null);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CourierHeader
        title="رحلتي"
        subtitle={
          order
            ? "خطوة بخطوة، حتى تسليم الطلب"
            : "رحلتك القادمة تبدأ من الرئيسية"
        }
        onRefresh={refreshActiveOrders}
      />

      {activeOrdersError && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={refreshActiveOrders}
          style={{ backgroundColor: "#FFF3DC", padding: 14 }}
        >
          <Text
            accessibilityRole="alert"
            style={{ color: "#8A4B0B", textAlign: "center", lineHeight: 22 }}
          >
            تعذّر تحديث الرحلة. تأكد من الإنترنت واضغط لإعادة المحاولة.
          </Text>
        </TouchableOpacity>
      )}
      {!order && activeOrdersError ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons
            name="wifi-off"
            size={48}
            color={colors.mutedForeground}
          />
          <Text style={{ color: colors.foreground }}>
            بانتظار تحديث بيانات الرحلة
          </Text>
        </View>
      ) : !order && isLoadingActive ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !order ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons
            name="check-circle-outline"
            size={64}
            color={colors.border}
          />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {t("courier.active.noActive.title")}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {t("courier.active.noActive.body")}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={[
              styles.statusBtn,
              { backgroundColor: colors.primary, paddingHorizontal: 28 },
            ]}
            onPress={() => router.navigate("/(courier)/available")}
          >
            <Text style={styles.statusBtnText}>عرض الطلبات المتاحة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingActive}
              onRefresh={refreshActiveOrders}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Queued next order(s) — shown while the current one is still in progress */}
          {queuedOrders.map((q) => (
            <View
              key={q.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: "#fff7ed",
                borderColor: "#f97316",
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginHorizontal: 12,
                marginTop: 12,
              }}
            >
              <MaterialIcons
                name="playlist-add-check"
                size={22}
                color="#f97316"
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: "#9a3412", fontWeight: "700", fontSize: 13 }}
                >
                  الطلب التالي بالطابور
                </Text>
                <Text
                  style={{ color: colors.foreground, fontSize: 14 }}
                  numberOfLines={1}
                >
                  {q.orderType === "errand"
                    ? (q.placeName ?? "مشوار")
                    : q.restaurantName}{" "}
                  — {q.address}
                </Text>
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  رح توصّلو بعد ما تسلّم الطلب الحالي
                </Text>
              </View>
              {q.restaurantPhone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${q.restaurantPhone}`)}
                  style={{
                    backgroundColor: "#f97316",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialIcons name="call" size={16} color="#fff" />
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}
                  >
                    المطعم
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          <View
            style={[
              styles.journeyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
              الخطوة {Math.max(1, currentStepIndex + 1)} من 3 • الطلب #
              {order.id.slice(-6)}
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                color: colors.foreground,
                fontSize: 23,
                fontWeight: "800",
              }}
            >
              {order.status === "accepted"
                ? "استلم الطلب من المحل"
                : order.status === "picked_up"
                  ? "جاهز؟ انطلق للزبون"
                  : "سلّم الطلب للزبون"}
            </Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {STEPS.slice(0, 3).map((step, index) => (
                <View
                  key={step.status}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 4,
                    backgroundColor:
                      index <= currentStepIndex
                        ? colors.primary
                        : colors.border,
                  }}
                />
              ))}
            </View>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: 16,
                lineHeight: 25,
              }}
            >
              {order.status === "accepted"
                ? order.orderType === "errand"
                  ? order.placeName
                  : order.restaurantName
                : order.address}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleNavigate}
              style={[
                styles.statusBtn,
                { backgroundColor: "#EAF0F5", flexDirection: "row", gap: 8 },
              ]}
            >
              <MaterialIcons name="navigation" size={23} color="#172B3A" />
              <Text
                style={{ color: "#172B3A", fontSize: 17, fontWeight: "700" }}
              >
                {navigatesToRestaurant
                  ? "الاتجاه إلى مكان الاستلام"
                  : "الاتجاه إلى الزبون"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Map */}
          {mapTargetLat != null && mapTargetLon != null ? (
            <View style={[styles.mapCard, { borderColor: colors.border }]}>
              <CourierMap
                destinationLat={mapTargetLat}
                destinationLon={mapTargetLon}
                courierLat={courierLocation?.latitude}
                courierLon={courierLocation?.longitude}
                address={
                  navigatesToRestaurant
                    ? order.restaurantName || order.address
                    : order.address
                }
                onNavigate={handleNavigate}
              />
              <TouchableOpacity
                style={styles.mapNavigateBtn}
                onPress={handleNavigate}
                activeOpacity={0.85}
              >
                <MaterialIcons name="navigation" size={16} color="#fff" />
                <Text style={styles.mapNavigateBtnText}>
                  {navigatesToRestaurant
                    ? t("courier.active.toRestaurant")
                    : t("courier.active.toCustomer")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Order details */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {order.orderType === "errand" ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="shopping-bag" size={18} color="#ea580c" />
                <View style={styles.infoContent}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      مطلوب من
                    </Text>
                    <View style={styles.errandBadge}>
                      <Text style={styles.errandBadgeText}>مندوب متجول</Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.infoValue,
                      { color: "#ea580c", fontWeight: "800" },
                    ]}
                  >
                    {order.placeName ?? "—"}
                  </Text>
                </View>
              </View>
            ) : order.restaurantName ? (
              <View style={styles.infoRow}>
                <MaterialIcons
                  name="restaurant"
                  size={18}
                  color={colors.primary}
                />
                <View style={styles.infoContent}>
                  <Text
                    style={[
                      styles.infoLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("courier.available.restaurant")}
                  </Text>
                  <Text
                    style={[styles.infoValue, { color: colors.foreground }]}
                  >
                    {order.restaurantName}
                  </Text>
                </View>
              </View>
            ) : null}

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {(() => {
              const typedOrder = order as typeof order & {
                items?: {
                  id: string;
                  nameAr: string;
                  qty: number;
                  unitPrice: number;
                  lineTotal: number;
                  note?: string | null;
                  options?: { nameAr: string; extraPrice: number }[];
                }[];
                restaurantNote?: string | null;
              };
              const structuredItems = typedOrder.items ?? [];
              if (structuredItems.length > 0) {
                return (
                  <View style={styles.infoRow}>
                    <MaterialIcons
                      name="receipt-long"
                      size={18}
                      color={colors.primary}
                    />
                    <View style={[styles.infoContent, { gap: 6 }]}>
                      <Text
                        style={[
                          styles.infoLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        تفاصيل الطلب
                      </Text>
                      {structuredItems.map((it) => (
                        <View key={it.id}>
                          <Text
                            style={[
                              styles.infoValue,
                              { color: colors.foreground },
                            ]}
                          >
                            {it.nameAr} × {it.qty}
                            {"  "}
                            <Text
                              style={{
                                color: colors.primary,
                                fontWeight: "700",
                              }}
                            >
                              {it.lineTotal.toLocaleString()} ل.س
                            </Text>
                          </Text>
                          {(it.options ?? []).map((opt, i) => (
                            <Text
                              key={i}
                              style={[
                                {
                                  color: colors.mutedForeground,
                                  fontSize: 12,
                                  paddingRight: 12,
                                },
                              ]}
                            >
                              ↳ {opt.nameAr}
                              {opt.extraPrice > 0
                                ? ` (+${opt.extraPrice.toLocaleString()})`
                                : ""}
                            </Text>
                          ))}
                          {it.note ? (
                            <Text
                              style={[
                                {
                                  color: colors.mutedForeground,
                                  fontSize: 12,
                                  paddingRight: 12,
                                },
                              ]}
                            >
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
                  <MaterialIcons
                    name="notes"
                    size={18}
                    color={colors.primary}
                  />
                  <View style={styles.infoContent}>
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {t("courier.active.orderText")}
                    </Text>
                    <Text
                      style={[styles.infoValue, { color: colors.foreground }]}
                    >
                      {order.orderText}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {(order as typeof order & { restaurantNote?: string | null })
              .restaurantNote ? (
              <View
                style={[
                  styles.infoRow,
                  {
                    backgroundColor: "#FEF3C7",
                    borderRadius: 10,
                    padding: 10,
                    marginTop: 4,
                  },
                ]}
              >
                <MaterialIcons name="sticky-note-2" size={18} color="#B45309" />
                <View style={styles.infoContent}>
                  <Text
                    style={[
                      styles.infoLabel,
                      { color: "#B45309", fontWeight: "700" },
                    ]}
                  >
                    ملاحظة الزبون
                  </Text>
                  <Text style={[styles.infoValue, { color: "#78350F" }]}>
                    {
                      (
                        order as typeof order & {
                          restaurantNote?: string | null;
                        }
                      ).restaurantNote
                    }
                  </Text>
                </View>
              </View>
            ) : null}

            {order.address ? (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.infoRow}>
                  <MaterialIcons
                    name="location-on"
                    size={18}
                    color={colors.primary}
                  />
                  <View style={styles.infoContent}>
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {t("courier.active.address")}
                    </Text>
                    <Text
                      style={[styles.infoValue, { color: colors.foreground }]}
                    >
                      {order.address}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {order.deliveryFee != null && order.deliveryFee > 0 ? (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.infoRow}>
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={18}
                    color="#ea580c"
                  />
                  <View style={styles.infoContent}>
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      رسوم التوصيل
                    </Text>
                    <Text
                      style={[
                        styles.infoValue,
                        { color: "#ea580c", fontWeight: "800" },
                      ]}
                    >
                      {order.deliveryFee.toLocaleString("ar-SY")} ل.س
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {(order.flashDealDiscount ?? 0) > 0 ? (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.infoRow}>
                  <MaterialIcons name="bolt" size={18} color="#c2410c" />
                  <View style={styles.infoContent}>
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      خصم الفلاش (على الأكل)
                    </Text>
                    <Text
                      style={[
                        styles.infoValue,
                        { color: "#c2410c", fontWeight: "800" },
                      ]}
                    >
                      − {(order.flashDealDiscount ?? 0).toLocaleString("ar-SY")}{" "}
                      ل.س
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {order.orderType !== "errand" && order.totalPrice != null ? (
              <>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.infoRow}>
                  <MaterialIcons name="payments" size={18} color="#16a34a" />
                  <View style={styles.infoContent}>
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      المطلوب تحصيله من الزبون (الدفع نقداً)
                    </Text>
                    <Text
                      style={[
                        styles.infoValue,
                        { color: "#16a34a", fontWeight: "800", fontSize: 17 },
                      ]}
                    >
                      {(
                        (order.totalPrice ?? 0) + (order.deliveryFee ?? 0)
                      ).toLocaleString("ar-SY")}{" "}
                      ل.س
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
                <Text style={styles.callBtnText}>
                  {t("courier.active.call")}
                </Text>
              </TouchableOpacity>
            ) : null}

            {sanitizedRestaurantPhone ? (
              <TouchableOpacity
                style={[styles.callBtn, { backgroundColor: "#ea580c" }]}
                onPress={callRestaurant}
                activeOpacity={0.8}
              >
                <MaterialIcons name="restaurant" size={20} color="#fff" />
                <Text style={styles.callBtnText}>
                  {t("courier.active.callRestaurant")}
                </Text>
              </TouchableOpacity>
            ) : null}

            {sanitizedRestaurantPhone ? (
              <TouchableOpacity
                style={[
                  styles.chatBtn,
                  { backgroundColor: "#25D366", borderColor: "#25D366" },
                ]}
                onPress={whatsappRestaurant}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="whatsapp"
                  size={20}
                  color="#fff"
                />
                <Text style={[styles.chatBtnText, { color: "#fff" }]}>
                  {t("courier.active.whatsappRestaurant")}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.chatBtn,
                { backgroundColor: "#25D366", borderColor: "#25D366" },
              ]}
              onPress={openWhatsApp}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="whatsapp" size={20} color="#fff" />
              <Text style={[styles.chatBtnText, { color: "#fff" }]}>
                {t("courier.active.whatsapp")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Relinquishing an assignment is allowed only before pickup. */}
          {order.status === "accepted" ? (
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: "#ef4444" }]}
              onPress={handleCancelOrder}
              disabled={cancelling || updating || activeOrdersError}
              activeOpacity={0.8}
            >
              <MaterialIcons name="cancel" size={18} color="#ef4444" />
              <Text style={styles.cancelBtnText}>
                {cancelling ? "جاري الاعتذار..." : "تعذّر عليّ الاستلام"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
      {order && currentStep?.nextStatus && (
        <View style={styles.bottomAction}>
          {order.status === "on_way" && order.orderType !== "errand" && order.totalPrice != null && (
            <Text style={{ color: "#16805C", fontWeight: "800", fontSize: 18, textAlign: "center" }}>
              للتحصيل: {(order.totalPrice + (order.deliveryFee ?? 0)).toLocaleString("ar-SY")} ل.س
            </Text>
          )}
          <Text
            style={{
              color: colors.mutedForeground,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {order.status === "on_way"
              ? "أكّد التسليم بعد تسليم الطلب وتحصيل المستحقات"
              : "أكّد الخطوة بعد تنفيذها"}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{
              disabled: updating || cancelling || activeOrdersError,
              busy: updating,
            }}
            style={[
              styles.statusBtn,
              {
                backgroundColor: colors.primary,
                opacity: updating || cancelling || activeOrdersError ? 0.65 : 1,
              },
            ]}
            onPress={() => handleStatusUpdate(currentStep.nextStatus!)}
            disabled={updating || cancelling || activeOrdersError}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.statusBtnText}>
                {order.status === "accepted" && order.orderType === "errand"
                  ? "استلمت المشتريات"
                  : t(currentStep.nextLabel ?? "courier.active.updateStatus")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  journeyCard: {
    margin: 16,
    marginBottom: 0,
    padding: 20,
    borderWidth: 1,
    borderRadius: 22,
    gap: 14,
  },
  bottomAction: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#DCE3EA",
    padding: 14,
    gap: 8,
  },
  container: { flex: 1 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  emptyBody: { fontSize: 14, textAlign: "center" },
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
    flexWrap: "wrap",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
  },
  callBtn: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 54,
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
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  chatBtnText: { fontSize: 15, fontWeight: "700" },
  errandBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#fff3e0",
  },
  errandBadgeText: { fontSize: 10, fontWeight: "700", color: "#ea580c" },
  statusBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    minHeight: 56,
    borderRadius: 16,
  },
  statusBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
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
    // Inside a ScrollView a flex:1 map collapses to zero height, so the map card
    // needs an explicit height to actually render.
    height: 240,
  },
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
