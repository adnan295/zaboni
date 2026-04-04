import React, { useState, useRef } from "react";
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

export default function PhoneScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const inputRef = useRef<TextInput>(null);

  const isValid = phone.replace(/\s/g, "").length >= 9;

  const handleContinue = () => {
    if (!isValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const cleaned = phone.replace(/\s/g, "");
    router.push({ pathname: "/auth/otp", params: { phone: cleaned } });
  };

  const formatPhone = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: topPadding + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Brand */}
        <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="delivery-dining" size={48} color="#fff" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          مرحباً بك في مرسول
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          أدخل رقم جوالك للمتابعة
        </Text>

        {/* Phone input */}
        <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.prefix, { borderRightColor: colors.border }]}>
            <Text style={[styles.prefixFlag, { color: colors.foreground }]}>🇸🇦</Text>
            <Text style={[styles.prefixText, { color: colors.foreground }]}>+966</Text>
          </View>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder="5X XXX XXXX"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            maxLength={11}
            autoFocus
            textAlign="right"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.continueBtn,
            { backgroundColor: isValid ? colors.primary : colors.muted },
          ]}
          onPress={handleContinue}
          disabled={!isValid}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.continueBtnText,
              { color: isValid ? "#fff" : colors.mutedForeground },
            ]}
          >
            متابعة
          </Text>
          <MaterialIcons
            name="arrow-back"
            size={20}
            color={isValid ? "#fff" : colors.mutedForeground}
          />
        </TouchableOpacity>

        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          بالمتابعة، أنت توافق على{" "}
          <Text style={{ color: colors.primary }}>شروط الاستخدام</Text>
          {" و"}
          <Text style={{ color: colors.primary }}>سياسة الخصوصية</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    paddingHorizontal: 24,
    alignItems: "center",
    paddingBottom: 40,
  },
  logoBox: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    shadowColor: "#FF6B00",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 36,
    textAlign: "center",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 20,
    overflow: "hidden",
    height: 58,
  },
  prefix: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 6,
    borderRightWidth: 1,
    height: "100%",
  },
  prefixFlag: { fontSize: 20 },
  prefixText: { fontSize: 16, fontWeight: "600" },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 1,
  },
  continueBtn: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: "700",
  },
  terms: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
