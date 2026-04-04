import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useOrders } from "@/context/OrderContext";
import { useAddresses } from "@/context/AddressContext";

export default function OrderRequestScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restaurantName } = useLocalSearchParams<{ restaurantName?: string }>();
  const { placeOrder } = useOrders();
  const { defaultAddress } = useAddresses();

  const prefix = restaurantName ? `من ${restaurantName}: ` : "";
  const [orderText, setOrderText] = useState(prefix);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = orderText.trim().length >= 5 && orderText.trim() !== prefix.trim();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const address = defaultAddress?.label ?? "الموقع الحالي";
    const order = placeOrder(orderText.trim(), restaurantName ?? "طلب عام", address);
    router.replace({
      pathname: "/order-tracking/[id]",
      params: { id: order.id },
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>اكتب طلبك</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Restaurant badge */}
        {restaurantName ? (
          <View style={[styles.restaurantBadge, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="restaurant" size={16} color={colors.primary} />
            <Text style={[styles.restaurantBadgeText, { color: colors.primary }]}>
              {restaurantName}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>تفاصيل طلبك</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          مثال: بدي كولا وشاورما دجاج من عند الشاطر حسن
        </Text>

        {/* Text area */}
        <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: isValid ? colors.primary : colors.border }]}>
          <TextInput
            style={[styles.textArea, { color: colors.foreground }]}
            placeholder="اكتب ما تريد طلبه بالتفصيل..."
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

        {/* Address row */}
        <View style={[styles.addressRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialIcons name="location-on" size={20} color={colors.primary} />
          <View style={styles.addrInfo}>
            <Text style={[styles.addrLabel, { color: colors.mutedForeground }]}>عنوان التوصيل</Text>
            <Text style={[styles.addrText, { color: colors.foreground }]}>
              {defaultAddress?.label ?? "أضف عنواناً"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/addresses")}>
            <Text style={[styles.changeAddr, { color: colors.primary }]}>تغيير</Text>
          </TouchableOpacity>
        </View>

        {/* How it works */}
        <View style={[styles.howCard, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.howTitle, { color: colors.foreground }]}>كيف يعمل؟</Text>
          {[
            { icon: "send" as const, text: "يُرسل طلبك للمندوبين القريبين" },
            { icon: "check-circle" as const, text: "مندوب يقبل ويذهب لإحضار طلبك" },
            { icon: "chat" as const, text: "تفتح دردشة لتنسيق التفاصيل معه" },
          ].map((row, i) => (
            <View key={i} style={styles.howRow}>
              <MaterialIcons name={row.icon} size={16} color={colors.primary} />
              <Text style={[styles.howText, { color: colors.mutedForeground }]}>{row.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: bottomPadding + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: isValid ? colors.primary : colors.muted }]}
          onPress={handleSubmit}
          disabled={!isValid || isSubmitting}
          activeOpacity={0.85}
        >
          <MaterialIcons name="send" size={20} color={isValid ? "#fff" : colors.mutedForeground} />
          <Text style={[styles.submitText, { color: isValid ? "#fff" : colors.mutedForeground }]}>
            {isSubmitting ? "جاري الإرسال..." : "أرسل الطلب"}
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
  content: { padding: 16, gap: 16, paddingBottom: 20 },
  restaurantBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  restaurantBadgeText: { fontSize: 14, fontWeight: "700" },
  label: { fontSize: 17, fontWeight: "800", textAlign: "right" },
  hint: { fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: -8 },
  inputCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    minHeight: 150,
  },
  textArea: {
    fontSize: 15,
    lineHeight: 24,
    minHeight: 110,
  },
  charCount: { fontSize: 11, textAlign: "left", marginTop: 8 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  addrInfo: { flex: 1 },
  addrLabel: { fontSize: 11, marginBottom: 2 },
  addrText: { fontSize: 14, fontWeight: "600" },
  changeAddr: { fontSize: 13, fontWeight: "700" },
  howCard: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  howTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4, textAlign: "right" },
  howRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  howText: { fontSize: 13 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  submitText: { fontSize: 17, fontWeight: "700" },
});
