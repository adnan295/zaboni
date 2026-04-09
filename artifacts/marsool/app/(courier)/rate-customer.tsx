import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { customFetch } from "@workspace/api-client-react";

const STAR_LABELS = ["", "سيئ", "مقبول", "جيد", "جيد جداً", "ممتاز"];

export default function RateCustomerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = async () => {
    if (stars === 0) {
      Alert.alert("تنبيه", "الرجاء اختيار عدد النجوم");
      return;
    }
    if (!orderId) return;

    setSubmitting(true);
    try {
      await customFetch(`/api/courier/orders/${orderId}/rate-customer`, {
        method: "POST",
        body: JSON.stringify({ stars, comment: comment.trim() }),
      });
      Alert.alert("شكراً!", "تم إرسال تقييمك بنجاح", [
        { text: "حسناً", onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      if (msg === "Already rated this customer") {
        Alert.alert("تنبيه", "لقد قيّمت هذا الزبون مسبقاً", [
          { text: "حسناً", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("خطأ", "تعذّر إرسال التقييم، حاول مرة أخرى");
      }
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
        <View style={[styles.header, { paddingTop: topPadding + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>تقييم الزبون</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="person" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.prompt, { color: colors.foreground }]}>
              كيف كانت تجربتك مع الزبون؟
            </Text>
            <Text style={[styles.promptSub, { color: colors.mutedForeground }]}>
              تقييمك يساعد في تحسين تجربة الجميع
            </Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setStars(n)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={n <= stars ? "star" : "star-border"}
                    size={44}
                    color={n <= stars ? "#FF6B00" : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {stars > 0 && (
              <Text style={[styles.starLabel, { color: "#FF6B00" }]}>
                {STAR_LABELS[stars]}
              </Text>
            )}
          </View>

          <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.commentLabel, { color: colors.foreground }]}>
              تعليق (اختياري)
            </Text>
            <TextInput
              style={[
                styles.commentInput,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                  textAlign: "right",
                },
              ]}
              placeholder="مثال: زبون محترم وسريع الاستجابة..."
              placeholderTextColor={colors.mutedForeground}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
              {comment.length}/500
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: stars === 0 ? colors.border : colors.primary,
                opacity: submitting ? 0.7 : 1,
              },
            ]}
            onPress={handleSubmit}
            disabled={submitting || stars === 0}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>إرسال التقييم</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>تخطي</Text>
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
    gap: 14,
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  content: { padding: 16, gap: 16 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
  },
  prompt: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  promptSub: { fontSize: 13, textAlign: "center" },
  starsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  starLabel: { fontSize: 16, fontWeight: "700" },
  commentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  commentLabel: { fontSize: 15, fontWeight: "700" },
  commentInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: { fontSize: 11, textAlign: "left" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { fontSize: 14 },
});
