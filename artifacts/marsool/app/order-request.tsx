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
  const [feePreview, setFeePreview] = useState<FeePreview | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
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
  const canSubmit = hasItems && !!defaultAddress;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const addrLat = defaultAddress?.latitude;
  const addrLon = defaultAddress?.longitude;

  const [flashDeal, setFlashDeal] = useState<FlashDealInfo | null>(null);
  const [flashCountdown, setFlashCountdown] = useState<string>("");
  const [loyaltyInfo, setLoyaltyInfo] = useState<LoyaltyInfo | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [useWallet, setUseWallet] = useState(false);

  useEffect(() => {
    customFetch("/api/users/me/loyalty")
      .then((data) => setLoyaltyInfo(data as LoyaltyInfo))
      .catch(() => setLoyaltyInfo(null));
    customFetch("/api/wallet/balance")
      .then((data) => setWalletBalance((data as { balance: number }).balance))
      .catch(() => setWalletBalance(null));
  }, []);

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

  useEffect(() => {
    if (addrLat == null || addrLon == null) {
      setFeePreview(null);
      return;
    }
    setFeeLoading(true);
    const params = new URLSearchParams({ lat: String(addrLat), lon: String(addrLon) });
    if (restaurantId) params.set("restaurantId", restaurantId);
    customFetch(`/api/delivery-fee-preview?${params.toString()}`)
      .then((res) => {
        const data = res as FeePreview;
        setFeePreview(data);
      })
      .catch(() => setFeePreview(null))
      .finally(() => setFeeLoading(false));
  }, [addrLat, addrLon, restaurantId]);

  const deliveryFee = feePreview?.fee ?? undefined;

  const applyFlashDiscount = (base: number): number => {
    if (!flashDeal || base <= 0) return base;
    if (flashDeal.discountType === "percent") {
      return Math.max(0, Math.round(base * (1 - flashDeal.discountValue / 100)));
    }
    return Math.max(0, base - flashDeal.discountValue);
  };

  const effectiveDeliveryFee = deliveryFee != null ? applyFlashDiscount(deliveryFee) : undefined;
  const flashItemDiscount = flashDeal && subtotal > 0 ? subtotal - applyFlashDiscount(subtotal) : 0;
  const effectiveSubtotal = subtotal - flashItemDiscount;

  const checkPromo = useCallback(async (code: string) => {
    if (!code.trim()) {
      setPromoStatus("idle");
      setPromoResult(null);
      return;
    }
    setPromoStatus("checking");
    try {
      const body: { code: string; deliveryFee?: number; lat?: number; lon?: number; restaurantId?: string } = { code: code.trim() };
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
  }, [deliveryFee, addrLat, addrLon, restaurantId]);

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
    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const address = defaultAddress.label;
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
        usePoints,
        useWallet,
        flashDealId: flashDeal?.id ?? undefined,
        restaurantNote: restaurantNote.trim() || undefined,
      });
      cart.clear();
      router.replace({
        pathname: "/order-tracking/[id]",
        params: { id: order.id },
      });
    } catch {
      Alert.alert(t("common.error"), t("common.retry"));
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("orderRequest.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        {restaurantName ? (
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

        {walletBalance !== null && walletBalance > 0 && effectiveDeliveryFee != null && (
          <TouchableOpacity
            style={[styles.loyaltyToggleCard, {
              backgroundColor: useWallet ? "#f0fdf4" : colors.card,
              borderColor: useWallet ? "#22c55e" : colors.border,
            }]}
            onPress={() => setUseWallet((v) => !v)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="account-balance-wallet" size={20} color={useWallet ? "#16a34a" : colors.primary} />
            <View style={styles.addrInfo}>
              <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("wallet.useWallet")}</Text>
              <Text style={[styles.addrText, { color: useWallet ? "#15803d" : colors.foreground, fontWeight: "700" }]}>
                {t("wallet.useWalletDesc", {
                  balance: walletBalance.toLocaleString(),
                  discount: Math.min(walletBalance, subtotal + effectiveDeliveryFee).toLocaleString(),
                })}
              </Text>
            </View>
            <View style={[styles.toggleDot, { backgroundColor: useWallet ? "#22c55e" : colors.border }]}>
              <View style={[styles.toggleInner, { backgroundColor: useWallet ? "#fff" : colors.mutedForeground }]} />
            </View>
          </TouchableOpacity>
        )}

        {loyaltyInfo !== null && loyaltyInfo.balance > 0 && (
          <>
            <TouchableOpacity
              style={[styles.loyaltyToggleCard, {
                backgroundColor: usePoints ? "#fdf4ff" : colors.card,
                borderColor: usePoints ? "#a855f7" : colors.border,
              }]}
              onPress={() => setUsePoints((v) => !v)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="stars" size={20} color={usePoints ? "#a855f7" : colors.primary} />
              <View style={styles.addrInfo}>
                <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("loyalty.usePoints")}</Text>
                <Text style={[styles.addrText, { color: usePoints ? "#7e22ce" : colors.foreground, fontWeight: "700" }]}>
                  {t("loyalty.usePointsDesc", {
                    points: loyaltyInfo.balance.toLocaleString(),
                    discount: loyaltyInfo.redeemDiscount.toLocaleString(),
                  })}
                </Text>
              </View>
              <View style={[styles.toggleDot, { backgroundColor: usePoints ? "#a855f7" : colors.border }]}>
                <View style={[styles.toggleInner, { backgroundColor: usePoints ? "#fff" : colors.mutedForeground }]} />
              </View>
            </TouchableOpacity>

            {usePoints && feePreview != null && (
              <View style={[styles.pointsSummaryCard, { backgroundColor: "#f5f3ff", borderColor: "#a855f7" }]}>
                <MaterialIcons name="receipt-long" size={18} color="#7e22ce" />
                <View style={styles.addrInfo}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: "#6b21a8" }]}>{t("orderRequest.deliveryFee")}</Text>
                    <Text style={[styles.summaryValue, { color: "#6b21a8" }]}>{feePreview.fee.toLocaleString()} ل.س</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: "#a855f7" }]}>{t("loyalty.appliedDiscount", { amount: Math.min(loyaltyInfo.redeemDiscount, feePreview.fee).toLocaleString() })}</Text>
                    <Text style={[styles.summaryValue, { color: "#a855f7" }]}>- {Math.min(loyaltyInfo.redeemDiscount, feePreview.fee).toLocaleString()} ل.س</Text>
                  </View>
                  <View style={[styles.summaryRow, { marginTop: 4 }]}>
                    <Text style={[styles.summaryLabel, { color: "#581c87", fontWeight: "800", fontSize: 14 }]}>{t("orderRequest.totalAfterDiscount")}</Text>
                    <Text style={[styles.summaryValue, { color: "#581c87", fontWeight: "900", fontSize: 15 }]}>
                      {Math.max(0, feePreview.fee - loyaltyInfo.redeemDiscount).toLocaleString()} ل.س
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
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
                {(effectiveSubtotal + (effectiveDeliveryFee ?? 0)).toLocaleString()} ل.س
              </Text>
            </View>
            <Text style={[styles.totalNote, { color: colors.mutedForeground }]}>
              {t("orderRequest.serverPricedNote")}
            </Text>
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
          <MaterialIcons name="send" size={20} color={canSubmit ? "#fff" : colors.mutedForeground} />
          <Text style={[styles.submitText, { color: canSubmit ? "#fff" : colors.mutedForeground }]}>
            {isSubmitting ? t("orderRequest.sending") : t("orderRequest.sendOrder")}
          </Text>
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
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
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
    justifyContent: "center",
    gap: 8,
    height: 56,
    borderRadius: 16,
  },
  submitText: { fontSize: 17, fontWeight: "700" },
});
