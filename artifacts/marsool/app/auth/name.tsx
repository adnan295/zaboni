import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function NameScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = name.trim().length >= 2;
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  const handleFinish = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await signIn({ phone: phone ?? "", name: name.trim() });
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: topPadding + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-forward" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="person" size={36} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("auth.name.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {t("auth.name.subtitle")}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: name.length > 0 ? colors.primary : colors.border,
                color: colors.foreground,
              },
            ]}
            placeholder={t("auth.name.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleFinish}
            textAlign="right"
            maxLength={40}
          />

          <TouchableOpacity
            style={[
              styles.finishBtn,
              { backgroundColor: isValid ? colors.primary : colors.muted },
            ]}
            onPress={handleFinish}
            disabled={!isValid || loading}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.finishBtnText,
                { color: isValid ? "#fff" : colors.mutedForeground },
              ]}
            >
              {loading ? t("auth.name.loading") : t("auth.name.start")}
            </Text>
            {!loading && (
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={isValid ? "#fff" : colors.mutedForeground}
              />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  content: { alignItems: "center" },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 32, textAlign: "center" },
  input: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 20,
  },
  finishBtn: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  finishBtnText: { fontSize: 17, fontWeight: "700" },
});
