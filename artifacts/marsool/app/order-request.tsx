import { useCheckoutCoupon } from "@/hooks/useStamps";
import { useQuery } from "@tanstack/react-query";
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useOrders } from "@/context/OrderContext";
import { useAddresses } from "@/context/AddressContext";
import { useCart, type CartItem } from "@/context/CartContext";
import { customFetch } from "@workspace/api-client-react";
import ItemNoteModal from "@/components/ItemNoteModal";

type FlashDealInfo = {
  id: string;
  title: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  endsAt: string;
};

function formatCountdown(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface LoyaltyInfo {
  balance: number;
  redeemDiscount: number;
  earnRate: number;
  pointValue: number;
}

type PromoStatus = "idle" | "checking" | "valid" | "invalid" | "expired" | "exhausted" | "already_used";

interface PromoResult {
  valid: boolean;
  type?: "percent" | "fixed";
  value?: number;
  discountAmount?: number;
  code?: string;
  error?: string;
}

interface FeePreview {
  fee: number;
  /** Learned arrival time for this restaurant, distance and hour (newer servers only). */
  etaMinutes?: number | null;
  distanceKm: number;
  zoneLabel: string | null;
}

export default function OrderRequestScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { restaurantName: paramRestaurantName, restaurantId: paramRestaurantId } = useLocalSearchParams<{ restaurantName?: string; restaurantId?: string }>();
  const { placeOrder } = useOrders();
  const { defaultAddress } = useAddresses();
  const cart = useCart();

  const restaurantId = paramRestaurantId ?? cart.restaurantId ?? undefined;
  const restaurantName = paramRestaurantName ?? cart.restaurantName ?? undefined;
  const cartEntries = cart.entries;
  const subtotal = cart.subtotal;
  const { restaurantNote, setRestaurantNote } = cart;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editNoteItem, setEditNoteItem] = useState<CartItem | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<PromoStatus>("idle");
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasItems = cartEntries.length > 0;

  const itemSavings = useMemo(
    () => cartEntries.reduce((acc, item) => {
      if (item.originalPrice != null && item.originalPrice > item.price) {
        return acc + (item.originalPrice - item.price) * item.qty;
      }
      return acc;
    }, 0),
    [cartEntries]
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const addrLat = defaultAddress?.latitude;
  const addrLon = defaultAddress?.longitude;

  const [flashDeal, setFlashDeal] = useState<FlashDealInfo | null>(null);
  const [flashCountdown, setFlashCountdown] = useState<string>("");
  // «اطلب واربح»: a ready coupon from this restaurant is applied unless the customer turns it off.
  const couponQuery = useCheckoutCoupon(restaurantId ?? undefined);
  const stampCoupon = couponQuery.data ?? null;
  const [useCoupon, setUseCoupon] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    customFetch(`/api/restaurants/${restaurantId}/flash-deal`)
      .then((data) => {
        const deal = data as FlashDealInfo | null;
        setFlashDeal(deal);
        if (deal) setFlashCountdown(formatCountdown(deal.endsAt));
      })
      .catch(() => setFlashDeal(null));
  }, [restaurantId]);

  useEffect(() => {
    if (!flashDeal) return;
    const timer = setInterval(() => {
      setFlashCountdown(formatCountdown(flashDeal.endsAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [flashDeal]);

  // Each address/restaurant has its own query: late responses cannot price a new address.
  const hasCoordinates = addrLat != null && addrLon != null;
  const feeQuery = useQuery<FeePreview>({
    queryKey: ["checkout-delivery-fee", restaurantId, addrLat, addrLon],
    enabled: hasCoordinates,
    queryFn: async () => {
      const params = new URLSearchParams({ lat: String(addrLat), lon: String(addrLon) });
      if (restaurantId) params.set("restaurantId", restaurantId);
      return await customFetch(`/api/delivery-fee-preview?${params.toString()}`) as FeePreview;
    },
    staleTime: 0,
    retry: 1,
  });
  const feeLoading = hasCoordinates && feeQuery.isFetching;
  const feePreview = hasCoordinates && !feeQuery.isError ? feeQuery.data : undefined;
  const deliveryFee = !feeLoading && typeof feePreview?.fee === "number" && Number.isFinite(feePreview.fee) && feePreview.fee >= 0 ? feePreview.fee : undefined;
  const canSubmit = hasItems && !!defaultAddress && deliveryFee != null;
  // «35-45» from the learned estimate, rounded to fives; nothing when the server has none.
  const etaRange = (() => {
    const m = feePreview?.etaMinutes;
    if (!hasItems || typeof m !== "number" || !Number.isFinite(m) || m <= 0) return null;
    const low = Math.max(10, Math.round((m - 5) / 5) * 5);
    return `\u2066${low}-${low + 10}\u2069`;
  })();

  const applyFlashDiscount = (base: number): number => {
    if (!flashDeal || base <= 0) return base;
    if (flashDeal.discountType === "percent") {
      return Math.max(0, Math.round(base * (1 - flashDeal.discountValue / 100)));
    }
    return Math.max(0, base - flashDeal.discountValue);
  };

  // Flash deals are the restaurant's promotion: they discount the food only,
  // never the delivery fee. The fee shown here stays the full delivery fee.
  const effectiveDeliveryFee = deliveryFee;
  const flashItemDiscount = flashDeal && subtotal > 0 ? subtotal - applyFlashDiscount(subtotal) : 0;
  const effectiveSubtotal = subtotal - flashItemDiscount;
  // An amount coupon comes off the food (never more than it); a free-dish coupon
  // pays for one of that dish, so the dish must be in the cart.
  const couponDiscount = (() => {
    if (!stampCoupon) return 0;
    if (stampCoupon.rewardType === "item") {
      const line = cart.entries.find((e) => e.menuItemId === stampCoupon.rewardItemId);
      return line ? Math.min(line.price, effectiveSubtotal) : 0;
    }
    return Math.min(stampCoupon.rewardAmount, effectiveSubtotal);
  })();
  const couponUsable = couponDiscount > 0;
  const couponApplies = !!stampCoupon && useCoupon && couponUsable;
  const payableItems = effectiveSubtotal - (couponApplies ? couponDiscount : 0);

  const checkPromo = useCallback(async (code: string) => {
    if (!code.trim()) {
      setPromoStatus("idle");
      setPromoResult(null);
      return;
    }
    setPromoStatus("checking");
    try {
      const body: { code: string; itemsTotal?: number; deliveryFee?: number; lat?: number; lon?: number; restaurantId?: string } = { code: code.trim(), itemsTotal: subtotal };
      if (deliveryFee != null) {
        body.deliveryFee = deliveryFee;
      } else if (addrLat != null && addrLon != null) {
        body.lat = addrLat;
        body.lon = addrLon;
      }
      if (restaurantId) {
        body.restaurantId = restaurantId;
      }
      const res = await customFetch("/api/orders/validate-promo", {
        method: "POST",
        body: JSON.stringify(body),
      }) as PromoResult;
      setPromoResult(res);
      setPromoStatus("valid");
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string } };
      const errorCode = apiErr?.data?.error ?? "invalid";
      setPromoResult({ valid: false, error: errorCode });
      setPromoStatus(errorCode as PromoStatus);
    }
  }, [deliveryFee, addrLat, addrLon, restaurantId, subtotal]);

  const handlePromoChange = (text: string) => {
    setPromoCode(text);
    setPromoStatus("idle");
    setPromoResult(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 3) {
      debounceRef.current = setTimeout(() => checkPromo(text), 500);
    }
  };

  const getPromoStatusText = (): string | null => {
    switch (promoStatus) {
      case "checking": return t("orderRequest.promoChecking");
      case "valid": return promoResult?.discountAmount
        ? t("orderRequest.promoDiscount", { amount: promoResult.discountAmount.toLocaleString() })
        : t("orderRequest.promoApplied");
      case "invalid": return t("orderRequest.promoInvalid");
      case "expired": return t("orderRequest.promoExpired");
      case "exhausted": return t("orderRequest.promoExhausted");
      case "already_used": return t("orderRequest.promoAlreadyUsed");
      default: return null;
    }
  };

  const getPromoStatusColor = (): string => {
    if (promoStatus === "valid") return "#22c55e";
    if (promoStatus === "checking") return colors.mutedForeground;
    if (promoStatus !== "idle") return "#ef4444";
    return colors.mutedForeground;
  };

  const handleSubmit = async () => {
    if (!hasItems || isSubmitting) return;
    if (deliveryFee == null) {
      Alert.alert(t("common.error"), t("orderRequest.feeUnavailable"));
      return;
    }
    if (!defaultAddress) {
      Alert.alert(
        t("orderRequest.noAddressTitle"),
        t("orderRequest.noAddressBody"),
        [
          { text: t("orderRequest.addAddress"), onPress: () => router.push("/addresses"), style: "default" },
          { text: t("common.cancel"), style: "cancel" },
        ]
      );
      return;
    }
    if (defaultAddress.latitude == null || defaultAddress.longitude == null) {
      Alert.alert(
        t("orderRequest.noLocationTitle"),
        t("orderRequest.noLocationBody"),
        [
          { text: t("orderRequest.setLocation"), onPress: () => router.push("/addresses"), style: "default" },
          { text: t("common.cancel"), style: "cancel" },
        ]
      );
      return;
    }
    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const address = defaultAddress.address?.trim()
      ? `${defaultAddress.label} — ${defaultAddress.address.trim()}`
      : defaultAddress.label;
    const appliedPromo = promoStatus === "valid" && promoCode.trim() ? promoCode.trim() : undefined;
    const lat = defaultAddress.latitude ?? undefined;
    const lon = defaultAddress.longitude ?? undefined;
    const items = cartEntries.map((e) => ({
      menuItemId: e.menuItemId,
      qty: e.qty,
      note: e.note,
      selectedOptions: (e.selectedOptions ?? []).map((o) => ({ optionId: o.optionId })),
    }));
    try {
      const order = await placeOrder({
        items,
        restaurantName: restaurantName ?? t("orderRequest.title"),
        address,
        promoCode: appliedPromo,
        lat,
        lon,
        restaurantId,
        flashDealId: flashDeal?.id ?? undefined,
        stampCouponId: couponApplies ? stampCoupon!.id : undefined,
        restaurantNote: restaurantNote.trim() || undefined,
      });
      cart.clear();
      router.replace({
        pathname: "/order-tracking/[id]",
        params: { id: order.id },
      });
    } catch (err: unknown) {
      // Surface the server's message when present (e.g. out-of-delivery-area,
      // location required) so the customer sees the real reason.
      const apiErr = err as { data?: { message?: string } };
      Alert.alert(t("common.error"), apiErr?.data?.message ?? t("common.retry"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const promoStatusText = getPromoStatusText();
  const promoStatusColor = getPromoStatusColor();

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {hasItems ? t("orderRequest.reviewTitle") : t("orderRequest.title")}
          </Text>
          {!!restaurantName && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {t("orderRequest.fromRestaurant", { name: restaurantName })}
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* When will it arrive — the first thing people want to know before sending */}
        {etaRange && (
          <View style={[styles.etaCard, { backgroundColor: colors.secondary }]} accessibilityRole="summary">
            <MaterialIcons name="schedule" size={28} color={colors.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.etaTitle, { color: colors.secondaryForeground }]}>
                {t("orderRequest.etaTitle", { range: etaRange })}
              </Text>
              <Text style={[styles.etaSub, { color: colors.secondaryForeground }]}>{t("orderRequest.etaSub")}</Text>
            </View>
          </View>
        )}

        {flashDeal && (
          <View style={styles.flashDealBanner}>
            <View style={styles.flashDealLeft}>
              <Text style={styles.flashDealTitle}>⚡ {flashDeal.title}</Text>
              <Text style={styles.flashDealDesc}>
                {t("orderRequest.flashDealBannerDesc", {
                  discount: flashDeal.discountType === "percent"
                    ? `${flashDeal.discountValue}%`
                    : `${flashDeal.discountValue.toLocaleString()} ل.س`,
                })}
              </Text>
            </View>
            {flashCountdown ? (
              <View style={styles.flashDealTimer}>
                <Text style={styles.flashDealTimerLabel}>ينتهي خلال</Text>
                <Text style={styles.flashDealTimerValue}>{flashCountdown}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* The header already says «من …» once there are items; the badge is for the typed order only. */}
        {restaurantName && !hasItems ? (
          <View style={[styles.restaurantBadge, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="restaurant" size={16} color={colors.primary} />
            <Text style={[styles.restaurantBadgeText, { color: colors.primary }]}>
              {restaurantName}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>{t("orderRequest.itemsTitle")}</Text>

        {hasItems ? (
          <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {cartEntries.map((item, idx) => (
              <View
                key={item.menuItemId}
                style={[
                  styles.itemRow,
                  idx < cartEntries.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
                    {item.nameAr}
                  </Text>
                  {(item.selectedOptions ?? []).length > 0 && (
                    <View style={styles.optionChips}>
                      {(item.selectedOptions ?? []).map((opt, i) => (
                        <View key={i} style={[styles.optionChip, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.optionChipText, { color: colors.primary }]}>
                            {opt.nameAr}{opt.extraPrice > 0 ? ` +${opt.extraPrice.toLocaleString()}` : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {item.note ? (
                    <TouchableOpacity
                      style={styles.noteEditRow}
                      onPress={() => setEditNoteItem(item)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.itemNote, { color: colors.mutedForeground, flex: 1 }]} numberOfLines={2}>
                        {item.note}
                      </Text>
                      <MaterialIcons name="edit" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditNoteItem(item)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.addNoteLink, { color: colors.primary }]}>
                        + {t("menu.note.addNoteLink")}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.itemUnit, { color: colors.mutedForeground }]}>
                    {item.price.toLocaleString()} ل.س
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: colors.secondary }]}
                    onPress={() => cart.decItem(item.menuItemId)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={item.qty <= 1 ? "delete-outline" : "remove"}
                      size={18}
                      color={item.qty <= 1 ? "#ef4444" : colors.primary}
                    />
                  </TouchableOpacity>
                  <Text style={[styles.stepQty, { color: colors.foreground }]}>{item.qty}</Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: colors.primary }]}
                    onPress={() => cart.incItem(item.menuItemId)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.lineTotal, { color: colors.foreground }]}>
                  {(item.price * item.qty).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCart, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="remove-shopping-cart" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyCartText, { color: colors.mutedForeground }]}>
              {t("orderRequest.emptyCart")}
            </Text>
            {restaurantId ? (
              <TouchableOpacity
                style={[styles.emptyCartBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.replace({ pathname: "/restaurant/[id]", params: { id: restaurantId } })}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyCartBtnText}>{t("orderRequest.browseMenu")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {hasItems && (
          <View style={[styles.addressRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="chat-bubble-outline" size={20} color={colors.primary} />
            <View style={styles.addrInfo}>
              <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>ملاحظة للمطعم</Text>
              <TextInput
                style={[styles.noteInputInline, { color: colors.foreground }]}
                placeholder="مثال: بدون بصل، تحضير سريع…"
                placeholderTextColor={colors.mutedForeground}
                value={restaurantNote}
                onChangeText={setRestaurantNote}
                maxLength={300}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.addressRow, {
            backgroundColor: colors.card,
            borderColor: defaultAddress ? colors.border : "#ef4444",
          }]}
          onPress={() => router.push("/addresses")}
          activeOpacity={0.8}
        >
          <MaterialIcons name="location-on" size={20} color={defaultAddress ? colors.primary : "#ef4444"} />
          <View style={styles.addrInfo}>
            <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("orderRequest.deliveryAddress")}</Text>
            <Text style={[styles.addrText, { color: defaultAddress ? colors.foreground : "#ef4444" }]}>
              {defaultAddress?.label ?? t("orderRequest.noAddressTitle")}
            </Text>
          </View>
          <Text style={[styles.changeAddr, { color: colors.primary }]}>
            {defaultAddress ? t("orderRequest.changeAddress") : t("orderRequest.addAddress")}
          </Text>
        </TouchableOpacity>

        <View style={[styles.addressRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialIcons name="payments" size={20} color={colors.primary} />
          <View style={styles.addrInfo}>
            <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("payment.method")}</Text>
            <Text style={[styles.addrText, { color: colors.foreground }]}>{t("payment.cashOnDelivery")}</Text>
          </View>
        </View>

        {!feeLoading && deliveryFee == null && <View style={{ padding: 16, gap: 10 }}>
          <Text accessibilityRole="alert" style={{ color: colors.mutedForeground }}>{t(hasCoordinates ? "orderRequest.feeUnavailable" : "orderRequest.feeNeedsAddress")}</Text>
          {hasCoordinates && <TouchableOpacity accessibilityRole="button" onPress={() => void feeQuery.refetch()}><Text style={{ color: colors.primary }}>{t("common.retry")}</Text></TouchableOpacity>}
        </View>}
        {(feeLoading || feePreview != null) ? (
          <View style={[styles.feeCard, { backgroundColor: colors.card, borderColor: flashDeal ? "#f97316" : colors.border }]}>
            <MaterialIcons name="delivery-dining" size={20} color={flashDeal ? "#f97316" : colors.primary} />
            <View style={styles.addrInfo}>
              <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("orderRequest.deliveryFee")}</Text>
              {feeLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : feePreview && effectiveDeliveryFee != null ? (
                <View style={styles.feeRow}>
                  {effectiveDeliveryFee < feePreview.fee ? (
                    <>
                      <Text style={[styles.feeAmount, { color: "#f97316", fontWeight: "700" }]}>
                        {effectiveDeliveryFee.toLocaleString()} ل.س
                      </Text>
                      <Text style={[styles.feeAmount, { color: colors.mutedForeground, textDecorationLine: "line-through", fontSize: 13, fontWeight: "400" }]}>
                        {feePreview.fee.toLocaleString()}
                      </Text>
                    </>
                  ) : (
                    <Text style={[styles.feeAmount, { color: colors.foreground }]}>
                      {feePreview.fee.toLocaleString()} ل.س
                    </Text>
                  )}
                  <Text style={[styles.feeDistance, { color: colors.mutedForeground }]}>
                    ({feePreview.distanceKm} كم{feePreview.zoneLabel ? ` · ${feePreview.zoneLabel}` : ""})
                  </Text>
                </View>
              ) : feePreview ? (
                <View style={styles.feeRow}>
                  <Text style={[styles.feeAmount, { color: colors.foreground }]}>
                    {feePreview.fee.toLocaleString()} ل.س
                  </Text>
                  <Text style={[styles.feeDistance, { color: colors.mutedForeground }]}>
                    ({feePreview.distanceKm} كم{feePreview.zoneLabel ? ` · ${feePreview.zoneLabel}` : ""})
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* «اطلب واربح» coupon from this restaurant: on by default, food only. */}
        {hasItems && stampCoupon && (
          <TouchableOpacity
            style={[styles.couponCard, { backgroundColor: colors.card, borderColor: couponApplies ? colors.primary : colors.border }]}
            onPress={() => couponUsable && setUseCoupon((v) => !v)}
            activeOpacity={couponUsable ? 0.85 : 1}
            accessibilityRole="switch"
            accessibilityState={{ checked: couponApplies, disabled: !couponUsable }}
          >
            <View style={[styles.couponIcon, { backgroundColor: colors.secondary }]}>
              <MaterialIcons name="card-giftcard" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.couponTitle, { color: colors.foreground }]}>استعمل كوبونك: {stampCoupon.label}</Text>
              <Text style={[styles.couponSub, { color: couponUsable ? colors.mutedForeground : colors.primaryDark }]}>
                {couponUsable ? "من أختامك عند هالمطعم" : `زيد «${stampCoupon.label.replace(/ ببلاش$/, "")}» للسلة لتاخده ببلاش`}
              </Text>
            </View>
            <MaterialIcons
              name={couponApplies ? "check-box" : "check-box-outline-blank"}
              size={26}
              color={couponApplies ? colors.primary : colors.mutedForeground}
            />
          </TouchableOpacity>
        )}

        <View style={[styles.promoCard, {
          backgroundColor: colors.card,
          borderColor: promoStatus === "valid" ? "#22c55e" : promoStatus !== "idle" && promoStatus !== "checking" ? "#ef4444" : colors.border,
        }]}>
          <MaterialIcons name="local-offer" size={20} color={promoStatus === "valid" ? "#22c55e" : colors.primary} />
          <View style={styles.promoContent}>
            <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("orderRequest.promoCode")}</Text>
            <TextInput
              style={[styles.promoInput, { color: colors.foreground }]}
              placeholder={t("orderRequest.promoPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={promoCode}
              onChangeText={handlePromoChange}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={30}
            />
            {promoStatusText ? (
              <Text style={[styles.promoStatusText, { color: promoStatusColor }]}>
                {promoStatusText}
              </Text>
            ) : null}
          </View>
          {promoStatus === "checking" ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : promoStatus === "valid" ? (
            <MaterialIcons name="check-circle" size={20} color="#22c55e" />
          ) : null}
        </View>

        {hasItems ? (
          <View style={[styles.totalsCard, { backgroundColor: colors.card, borderColor: flashItemDiscount > 0 ? "#f97316" : colors.border }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>{t("orderRequest.subtotal")}</Text>
              {flashItemDiscount > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.totalValue, { color: "#f97316", fontWeight: "700" }]}>
                    {effectiveSubtotal.toLocaleString()} ل.س
                  </Text>
                  <Text style={[styles.totalValue, { color: colors.mutedForeground, textDecorationLine: "line-through", fontSize: 13, fontWeight: "400" }]}>
                    {subtotal.toLocaleString()}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.totalValue, { color: colors.foreground }]}>{subtotal.toLocaleString()} ل.س</Text>
              )}
            </View>
            {couponApplies && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.success, fontWeight: "700" }]}>الكوبون</Text>
                <Text style={[styles.totalValue, { color: colors.success, fontWeight: "700" }]}>− {couponDiscount.toLocaleString("en-US")} ل.س</Text>
              </View>
            )}
            {hasItems && itemSavings > 0 && (
              <View style={[styles.savingsRow, { backgroundColor: "#f0fdf4", borderColor: "#86efac" }]}>
                <MaterialIcons name="savings" size={16} color="#16a34a" />
                <Text style={[styles.savingsText, { color: "#16a34a" }]}>
                  {t("orderRequest.itemSavings", { amount: itemSavings.toLocaleString() })}
                </Text>
              </View>
            )}
            {effectiveDeliveryFee != null ? (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>{t("orderRequest.deliveryFee")}</Text>
                {flashItemDiscount > 0 && deliveryFee != null && effectiveDeliveryFee < deliveryFee ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.totalValue, { color: "#f97316", fontWeight: "700" }]}>
                      {effectiveDeliveryFee.toLocaleString()} ل.س
                    </Text>
                    <Text style={[styles.totalValue, { color: colors.mutedForeground, textDecorationLine: "line-through", fontSize: 13, fontWeight: "400" }]}>
                      {deliveryFee!.toLocaleString()}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.totalValue, { color: colors.foreground }]}>{effectiveDeliveryFee.toLocaleString()} ل.س</Text>
                )}
              </View>
            ) : null}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.grandRow}>
              <Text style={[styles.grandLabel, { color: colors.foreground }]}>{t("orderRequest.total")}</Text>
              <Text style={[styles.grandValue, { color: colors.primary }]}>
                {effectiveDeliveryFee == null ? t("orderRequest.waitingForFee") : `${(payableItems + effectiveDeliveryFee).toLocaleString()} ل.س`}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPadding + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.muted }]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          activeOpacity={0.85}
        >
          <Text style={[styles.submitText, { color: canSubmit ? "#fff" : colors.mutedForeground }]}>
            {isSubmitting ? t("orderRequest.sending") : t("orderRequest.sendOrder")}
          </Text>
          {!isSubmitting && canSubmit && effectiveDeliveryFee != null && (
            <Text style={[styles.submitText, { color: "#fff" }]}>
              {(payableItems + effectiveDeliveryFee).toLocaleString("en-US")} ل.س
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ItemNoteModal
        visible={editNoteItem != null}
        item={editNoteItem}
        initialNote={editNoteItem?.note ?? ""}
        initialQty={editNoteItem?.qty ?? 1}
        isEdit
        onClose={() => setEditNoteItem(null)}
        onAdd={(note, _qty, _opts) => {
          if (editNoteItem) {
            cart.setItemNote(editNoteItem.menuItemId, note);
          }
          setEditNoteItem(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flashDealBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#DC2626",
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  flashDealLeft: { flex: 1, gap: 4 },
  flashDealTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  flashDealDesc: { fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 17 },
  flashDealTimer: { alignItems: "center", minWidth: 64 },
  flashDealTimerLabel: { fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  flashDealTimerValue: { fontSize: 18, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] as any },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { textAlign: "center", fontSize: 20, fontWeight: "800" },
  headerSub: { textAlign: "center", fontSize: 13, marginTop: 2 },
  etaCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  etaTitle: { fontSize: 17, fontWeight: "800", textAlign: "left" },
  etaSub: { fontSize: 13, textAlign: "left" },
  content: { padding: 16, gap: 16 },
  restaurantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  restaurantBadgeText: { fontSize: 14, fontWeight: "700" },
  label: { fontSize: 16, fontWeight: "800" },
  hint: { fontSize: 13, lineHeight: 18, marginTop: -8 },
  inputCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 8,
  },
  textArea: { fontSize: 15, lineHeight: 24, minHeight: 120 },
  charCount: { textAlign: "left", fontSize: 12 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  noteInputInline: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
    minHeight: 40,
  },
  optionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  optionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  optionChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  estimatedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  feeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  feeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  feeAmount: { fontSize: 15, fontWeight: "700" },
  feeDistance: { fontSize: 12 },
  addrInfo: { flex: 1 },
  addrLabel: { fontSize: 11, fontWeight: "600", marginBottom: 2 },
  addrText: { fontSize: 14, fontWeight: "600" },
  changeAddr: { fontSize: 13, fontWeight: "700" },
  couponCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 2, padding: 14 },
  couponIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  couponTitle: { fontSize: 15, fontWeight: "700", textAlign: "left" },
  couponSub: { fontSize: 13, textAlign: "left" },
  loyaltyToggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  toggleDot: {
    width: 38,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  pointsSummaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  summaryLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: "700" },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  promoContent: { flex: 1, gap: 2 },
  promoInput: { fontSize: 14, fontWeight: "600", paddingVertical: 0 },
  promoStatusText: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  howCard: {
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  howTitle: { fontSize: 14, fontWeight: "800", marginBottom: 4 },
  howRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  howText: { flex: 1, fontSize: 13, lineHeight: 18 },
  itemsCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: "700" },
  itemNote: { fontSize: 11, lineHeight: 15, fontStyle: "italic" },
  noteEditRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  addNoteLink: { fontSize: 11, fontWeight: "600" },
  itemUnit: { fontSize: 12 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  stepQty: { fontSize: 15, fontWeight: "800", minWidth: 22, textAlign: "center" },
  lineTotal: { fontSize: 14, fontWeight: "800", minWidth: 56, textAlign: "left" },
  emptyCart: { borderWidth: 1, borderRadius: 14, padding: 24, alignItems: "center", gap: 12 },
  emptyCartText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  emptyCartBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  emptyCartBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  savingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  savingsText: { fontSize: 14, fontWeight: "700", flex: 1 },
  totalsCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 14, fontWeight: "700" },
  divider: { height: 1, marginVertical: 2 },
  grandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  grandLabel: { fontSize: 16, fontWeight: "800" },
  grandValue: { fontSize: 18, fontWeight: "900" },
  totalNote: { fontSize: 11, lineHeight: 16 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    height: 56,
    borderRadius: 999,
  },
  submitText: { fontSize: 17, fontWeight: "700" },
});
