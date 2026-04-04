import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useRatings } from "@/context/RatingsContext";
import { useNotifications } from "@/context/NotificationsContext";

const QUICK_COMMENTS = [
  "الطعام كان لذيذاً",
  "التوصيل كان سريعاً",
  "التعبئة كانت ممتازة",
  "جودة عالية",
  "سأطلب مرة أخرى",
];

export default function RateOrderScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId, restaurantName } = useLocalSearchParams<{ orderId: string; restaurantName: string }>();
  const { rateOrder } = useRatings();
  const { addNotification } = useNotifications();

  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const displayStars = hovered > 0 ? hovered : stars;

  const STAR_LABELS: Record<number, string> = {
    1: "سيء",
    2: "مقبول",
    3: "جيد",
    4: "رائع",
    5: "ممتاز!",
  };

  const handleSubmit = async () => {
    if (stars === 0) return;
    await rateOrder(orderId, stars, comment, restaurantName ?? "");
    addNotification({
      type: "system",
      title: "شكراً على تقييمك!",
      body: `تقييمك لـ ${restaurantName} يساعدنا على تحسين الخدمة`,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);
    setTimeout(() => router.back(), 1500);
  };

  if (submitted) {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.successCard, { backgroundColor: colors.card }]}>
          <MaterialIcons name="check-circle" size={72} color="#16a34a" />
          <Text style={[styles.successTitle, { color: colors.foreground }]}>شكراً على تقييمك!</Text>
          <Text style={[styles.successBody, { color: colors.mutedForeground }]}>
            تقييمك يساعد الآخرين في اختياراتهم
          </Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 8 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <MaterialIcons key={s} name={s <= stars ? "star" : "star-border"} size={28} color={s <= stars ? "#f59e0b" : colors.border} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPadding + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>تقييم الطلب</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: bottomPadding + 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="restaurant" size={40} color={colors.primary} />
            <Text style={[styles.restaurantName, { color: colors.foreground }]}>{restaurantName}</Text>
            <Text style={[styles.prompt, { color: colors.mutedForeground }]}>
              كيف كانت تجربتك مع هذا الطلب؟
            </Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => {
                    setStars(s);
                    Haptics.selectionAsync();
                  }}
                  onPressIn={() => setHovered(s)}
                  onPressOut={() => setHovered(0)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={s <= displayStars ? "star" : "star-border"}
                    size={44}
                    color={s <= displayStars ? "#f59e0b" : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {displayStars > 0 && (
              <Text style={[styles.starLabel, { color: colors.primary }]}>
                {STAR_LABELS[displayStars]}
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>تعليق سريع</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll}>
              {QUICK_COMMENTS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: comment === c ? colors.primary : colors.secondary,
                      borderColor: comment === c ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setComment(comment === c ? "" : c)}
                >
                  <Text style={[styles.quickChipText, { color: comment === c ? "#fff" : colors.foreground }]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.textInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
              placeholder="أضف تعليقاً (اختياري)..."
              placeholderTextColor={colors.mutedForeground}
              value={comment}
              onChangeText={setComment}
              multiline
              textAlign="right"
              textAlignVertical="top"
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: stars > 0 ? colors.primary : colors.border },
            ]}
            onPress={handleSubmit}
            disabled={stars === 0}
            activeOpacity={0.8}
          >
            <MaterialIcons name="star" size={20} color="#fff" />
            <Text style={styles.submitBtnText}>إرسال التقييم</Text>
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
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  closeBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  restaurantName: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  prompt: { fontSize: 14, textAlign: "center" },
  starsRow: { flexDirection: "row", gap: 8, marginVertical: 8 },
  starLabel: { fontSize: 16, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "700", alignSelf: "flex-end" },
  quickScroll: { alignSelf: "stretch", marginBottom: 4 },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 8,
  },
  quickChipText: { fontSize: 13, fontWeight: "500" },
  textInput: {
    alignSelf: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    marginTop: 8,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  successCard: {
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    width: "100%",
  },
  successTitle: { fontSize: 22, fontWeight: "800" },
  successBody: { fontSize: 14, textAlign: "center" },
});
