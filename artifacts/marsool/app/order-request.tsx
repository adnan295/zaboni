import React, { useState, useRef, useCallback, useEffect } from "react";
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
import { customFetch } from "@workspace/api-client-react";

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
  const { restaurantName, restaurantId, reorderText, estimatedTotal } = useLocalSearchParams<{ restaurantName?: string; restaurantId?: string; reorderText?: string; estimatedTotal?: string }>();
  const { placeOrder } = useOrders();
  const { defaultAddress } = useAddresses();

  const prefix = restaurantName ? `${t("orderRequest.from")} ${restaurantName}: ` : "";
  const [orderText, setOrderText] = useState(reorderText ?? prefix);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<PromoStatus>("idle");
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [feePreview, setFeePreview] = useState<FeePreview | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isValid = orderText.trim().length >= 5 && orderText.trim() !== prefix.trim();
  const canSubmit = isValid && !!defaultAddress;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const steps = t("orderRequest.steps", { returnObjects: true }) as string[];
  const stepIcons: Array<keyof typeof MaterialIcons.glyphMap> = ["send", "check-circle", "chat"];

  const addrLat = defaultAddress?.latitude;
  const addrLon = defaultAddress?.longitude;

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
    if (!isValid || isSubmitting) return;
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
    try {
      const order = await placeOrder(orderText.trim(), restaurantName ?? t("orderRequest.title"), address, appliedPromo, lat, lon, restaurantId);
      router.replace({
        pathname: "/order-tracking/[id]",
        params: { id: order.id },
      });
    } catch {
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
        {restaurantName ? (
          <View style={[styles.restaurantBadge, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="restaurant" size={16} color={colors.primary} />
            <Text style={[styles.restaurantBadgeText, { color: colors.primary }]}>
              {restaurantName}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>{t("orderRequest.label")}</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {t("orderRequest.hint")}
        </Text>

        <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: isValid ? colors.primary : colors.border }]}>
          <TextInput
            style={[styles.textArea, { color: colors.foreground }]}
            placeholder={t("orderRequest.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            value={orderText}
            onChangeText={setOrderText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            textAlign="right"
            autoFocus
            maxLength={500}
          />
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {orderText.length}/500
          </Text>
        </View>

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

        {estimatedTotal && Number(estimatedTotal) > 0 ? (
          <View style={[styles.estimatedCard, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <MaterialIcons name="receipt-long" size={20} color="#ea580c" />
            <View style={styles.addrInfo}>
              <Text style={[styles.addrLabel, { color: "#9a3412" }]}>{t("orderRequest.estimatedTotal")}</Text>
              <View style={styles.feeRow}>
                <Text style={[styles.feeAmount, { color: "#ea580c" }]}>
                  ~{Number(estimatedTotal).toLocaleString()} ل.س
                </Text>
                <Text style={[styles.feeDistance, { color: "#c2410c" }]}>
                  {t("orderRequest.estimatedNote")}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {(feeLoading || feePreview != null) ? (
          <View style={[styles.feeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="delivery-dining" size={20} color={colors.primary} />
            <View style={styles.addrInfo}>
              <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>{t("orderRequest.deliveryFee")}</Text>
              {feeLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
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

        <View style={[styles.howCard, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.howTitle, { color: colors.foreground }]}>{t("orderRequest.howItWorks")}</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.howRow}>
              <MaterialIcons name={stepIcons[i]} size={16} color={colors.primary} />
              <Text style={[styles.howText, { color: colors.mutedForeground }]}>{step}</Text>
            </View>
          ))}
        </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
