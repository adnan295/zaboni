import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useAddresses } from "@/context/AddressContext";
import { useOrders } from "@/context/OrderContext";

const ERRAND_DELIVERY_FEE = 150;

export default function ErrandRequestScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { defaultAddress } = useAddresses();
  const { placeOrder } = useOrders();

  const [placeName, setPlaceName] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = async () => {
    if (!placeName.trim() || !itemsText.trim()) {
      Alert.alert(t("errand.errorTitle"), t("errand.requiredFields"));
      return;
    }
    if (!defaultAddress) {
      Alert.alert(t("errand.errorTitle"), t("errand.noAddressAlert"));
      router.push("/addresses");
      return;
    }
    if (defaultAddress.latitude == null || defaultAddress.longitude == null) {
      Alert.alert(t("orderRequest.noLocationTitle"), t("orderRequest.noLocationBody"), [
        { text: t("orderRequest.setLocation"), onPress: () => router.push("/addresses"), style: "default" },
        { text: t("common.cancel"), style: "cancel" },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const order = await placeOrder({
        orderType: "errand",
        placeName: placeName.trim(),
        orderText: itemsText.trim(),
        restaurantName: "",
        address: defaultAddress.address,
        lat: defaultAddress.latitude ?? undefined,
        lon: defaultAddress.longitude ?? undefined,
      });
      router.replace(`/order-tracking/${order.id}` as any);
    } catch (err: unknown) {
      // Surface the server's message when present (e.g. out-of-delivery-area).
      const apiErr = err as { data?: { message?: string } };
      Alert.alert(t("errand.errorTitle"), apiErr?.data?.message ?? t("errand.errorMsg"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.primary }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name={backIcon} size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("errand.title")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Info banner */}
          <View style={[styles.infoBanner, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
            <MaterialIcons name="shopping-bag" size={28} color="#ea580c" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.infoTitle, { color: "#c2410c" }]}>{t("errand.feeNote")}</Text>
              <Text style={[styles.infoDesc, { color: "#9a3412" }]}>{t("errand.feeDescription")}</Text>
            </View>
          </View>

          {/* Place name */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              {t("errand.placeNameLabel")} <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <MaterialIcons name="store" size={18} color={colors.primary} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder={t("errand.placeNamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={placeName}
                onChangeText={setPlaceName}
                textAlign="right"
                returnKeyType="next"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Items text */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.foreground }]}>
              {t("errand.itemsLabel")} <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <View style={[styles.textAreaWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.textArea, { color: colors.foreground }]}
                placeholder={t("errand.itemsPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={itemsText}
                onChangeText={setItemsText}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                textAlign="right"
                returnKeyType="default"
              />
            </View>
          </View>

          {/* Address row */}
          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t("errand.addressLabel")}</Text>
            <TouchableOpacity
              style={[styles.addressRow, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => router.push("/addresses")}
              activeOpacity={0.8}
            >
              <MaterialIcons name="location-on" size={20} color={colors.primary} />
              <Text style={[styles.addressText, { color: defaultAddress ? colors.foreground : colors.mutedForeground }]} numberOfLines={2}>
                {defaultAddress ? defaultAddress.address : t("errand.noAddress")}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
            {defaultAddress && (
              <TouchableOpacity onPress={() => router.push("/addresses")} style={styles.changeAddressBtn}>
                <Text style={[styles.changeAddressText, { color: colors.primary }]}>{t("errand.changeAddress")}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Fee summary */}
          <View style={[styles.feeSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.mutedForeground }]}>رسوم التوصيل</Text>
              <Text style={[styles.feeValue, { color: colors.primary }]}>
                {ERRAND_DELIVERY_FEE.toLocaleString("ar-SY")} ل.س
              </Text>
            </View>
            <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.mutedForeground }]}>تكلفة الأصناف</Text>
              <Text style={[styles.feeValue, { color: colors.foreground }]}>تُحدَّد عند التسليم</Text>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: submitting ? colors.border : colors.primary },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <MaterialIcons name="shopping-bag" size={20} color="#fff" />
            <Text style={styles.submitText}>
              {submitting ? t("errand.submitting") : t("errand.submit")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
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
    paddingBottom: 16,
    gap: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: "#fff", textAlign: "center" },
  content: { padding: 16, gap: 16 },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  infoTitle: { fontSize: 13, fontWeight: "700" },
  infoDesc: { fontSize: 12, lineHeight: 18 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  textAreaWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 120,
  },
  textArea: { flex: 1, fontSize: 15, lineHeight: 22, minHeight: 100 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  addressText: { flex: 1, fontSize: 14, lineHeight: 20 },
  changeAddressBtn: { alignSelf: "flex-end" },
  changeAddressText: { fontSize: 13, fontWeight: "600" },
  feeSummary: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 14 },
  feeValue: { fontSize: 14, fontWeight: "700" },
  feeDivider: { height: 1 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
