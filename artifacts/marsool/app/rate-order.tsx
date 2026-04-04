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

const STAR_LABELS: Record<number, string> = {
  1: "سيء",
  2: "مقبول",
  3: "جيد",
  4: "رائع",
  5: "ممتاز!",
};

function StarPicker({
  label,
  icon,
  stars,
  onStars,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  stars: number;
  onStars: (n: number) => void;
}) {
  const colors = useColors();
  const [hovered, setHovered] = useState(0);
  const display = hovered > 0 ? hovered : stars;

  return (
    <View style={[pickerStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={pickerStyles.labelRow}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
        <Text style={[pickerStyles.label, { color: colors.foreground }]}>{label}</Text>
      </View>
      <View style={pickerStyles.starsRow}>
        {[1, 2, 3, 4, 5].map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => {
              onStars(s);
              Haptics.selectionAsync();
            }}
            onPressIn={() => setHovered(s)}
            onPressOut={() => setHovered(0)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={s <= display ? "star" : "star-border"}
              size={40}
              color={s <= display ? "#f59e0b" : colors.border}
            />
          </TouchableOpacity>
        ))}
      </View>
      {display > 0 && (
        <Text style={[pickerStyles.starLabel, { color: colors.primary }]}>
          {STAR_LABELS[display]}
        </Text>
      )}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 16, fontWeight: "700" },
  starsRow: { flexDirection: "row", gap: 4 },
  starLabel: { fontSize: 15, fontWeight: "700" },
});

export default function RateOrderScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId, restaurantName } = useLocalSearchParams<{
    orderId: string;
    restaurantName: string;
  }>();
  const { rateOrder } = useRatings();
  const { addNotification } = useNotifications();

  const [restaurantStars, setRestaurantStars] = useState(0);
  const [courierStars, setCourierStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const canSubmit = restaurantStars > 0 && courierStars > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await rateOrder(orderId, restaurantStars, courierStars, comment, restaurantName ?? "");
    addNotification({
      type: "system",
      title: "شكراً على تقييمك!",
      body: `تقييمك لـ ${restaurantName} يساعدنا على تحسين الخدمة`,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);
    setTimeout(() => router.back(), 1800);
  };

  if (submitted) {
    const avgStars = Math.round((restaurantStars + courierStars) / 2);
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
              <MaterialIcons
                key={s}
                name={s <= avgStars ? "star" : "star-border"}
                size={28}
                color={s <= avgStars ? "#f59e0b" : colors.border}
              />
            ))}
          </View>
          <View style={styles.ratingBreakdown}>
            <View style={styles.breakdownRow}>
              <MaterialIcons name="restaurant" size={16} color={colors.primary} />
              <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>المطعم</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <MaterialIcons
                    key={s}
                    name={s <= restaurantStars ? "star" : "star-border"}
                    size={16}
                    color={s <= restaurantStars ? "#f59e0b" : colors.border}
                  />
                ))}
              </View>
            </View>
            <View style={styles.breakdownRow}>
              <MaterialIcons name="delivery-dining" size={16} color={colors.primary} />
              <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>المندوب</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <MaterialIcons
                    key={s}
                    name={s <= courierStars ? "star" : "star-border"}
                    size={16}
                    color={s <= courierStars ? "#f59e0b" : colors.border}
                  />
                ))}
              </View>
            </View>
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
        <View
          style={[
            styles.header,
            {
              paddingTop: topPadding + 12,
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>تقييم الطلب</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding + 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.restaurantBadge, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="store" size={20} color={colors.primary} />
            <Text style={[styles.restaurantName, { color: colors.foreground }]} numberOfLines={1}>
              {restaurantName}
            </Text>
          </View>

          <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
            قيّم تجربتك بشكل منفصل
          </Text>

          <StarPicker
            label="المطعم"
            icon="restaurant"
            stars={restaurantStars}
            onStars={setRestaurantStars}
          />

          <StarPicker
            label="المندوب"
            icon="delivery-dining"
            stars={courierStars}
            onStars={setCourierStars}
          />

          <View
            style={[
              styles.commentCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.commentTitle, { color: colors.foreground }]}>تعليق سريع</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.quickScroll}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            >
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
                  <Text
                    style={[
                      styles.quickChipText,
                      { color: comment === c ? "#fff" : colors.foreground },
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.secondary,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
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

          {!canSubmit && (restaurantStars > 0 || courierStars > 0) && (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {restaurantStars === 0
                ? "قيّم المطعم لإكمال التقييم"
                : "قيّم المندوب لإكمال التقييم"}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: canSubmit ? colors.primary : colors.border },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
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
  restaurantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  restaurantName: { fontSize: 16, fontWeight: "700", flex: 1 },
  sectionHeader: { fontSize: 13, marginBottom: 12, textAlign: "right" },
  commentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 8,
  },
  commentTitle: { fontSize: 15, fontWeight: "700", textAlign: "right" },
  quickScroll: { alignSelf: "stretch" },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickChipText: { fontSize: 13, fontWeight: "500" },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
  },
  hint: { fontSize: 13, textAlign: "center", marginBottom: 4 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
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
  ratingBreakdown: { gap: 6, alignSelf: "stretch", marginTop: 4 },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  breakdownLabel: { fontSize: 13, flex: 1 },
});
