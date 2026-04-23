import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  I18nManager,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import ZaboniLogo from "@/components/ZaboniLogo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/apiClient";

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();
  const { phone, channel } = useLocalSearchParams<{ phone: string; channel?: string }>();
  const isWhatsApp = channel === "whatsapp";
  const { signIn } = useAuth();
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown === 0) { setCanResend(true); return; }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const verifyOtp = async (code: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t("auth.otp.errorTitle"), data.error ?? t("auth.otp.errorMsg"));
        setOtp("");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.isNewUser) {
        router.push({
          pathname: "/auth/name",
          params: { phone, token: data.token, userId: data.user.id },
        });
      } else {
        await signIn(data.token, data.user);
        router.replace("/(tabs)");
      }
    } catch {
      Alert.alert(t("auth.otp.errorTitle"), t("auth.otp.errorMsg"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setOtp(digits);
    if (digits.length === OTP_LENGTH) {
      verifyOtp(digits);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCountdown(60);
    setCanResend(false);
    setOtp("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const base = getApiBaseUrl();
      await fetch(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
    } catch {}
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.inner, { paddingTop: topPadding + 16 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        style={[styles.backBtn, { backgroundColor: colors.card }]}
        onPress={() => router.back()}
      >
        <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.content}>
        <ZaboniLogo size="medium" showName={false} style={{ marginBottom: 20 }} />

        <Text style={[styles.title, { color: colors.foreground }]}>{t("auth.otp.title")}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t("auth.otp.subtitle")}</Text>
        <Text style={[styles.phone, { color: colors.foreground }]}>{phone}</Text>

        <TextInput
          ref={inputRef}
          value={otp}
          onChangeText={handleOtpChange}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          style={styles.hiddenInput}
          autoFocus
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.otpRow, I18nManager.isRTL && styles.otpRowLTR]}
          onPress={() => inputRef.current?.focus()}
          activeOpacity={1}
        >
          {Array.from({ length: OTP_LENGTH }).map((_, idx) => {
            const char = otp[idx] ?? "";
            const isFocused = idx === otp.length && otp.length < OTP_LENGTH && !loading;
            return (
              <View
                key={idx}
                style={[
                  styles.otpBox,
                  {
                    backgroundColor: colors.card,
                    borderColor: loading ? colors.border : char ? colors.primary : isFocused ? colors.primary : colors.border,
                    borderWidth: isFocused || char ? 2 : 1.5,
                  },
                ]}
              >
                {loading && idx === 0 ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.otpChar, { color: colors.foreground }]}>{char}</Text>
                )}
              </View>
            );
          })}
        </TouchableOpacity>

        <View style={[styles.hintBox, { backgroundColor: colors.secondary }]}>
          <MaterialIcons name={isWhatsApp ? "chat" : "info-outline"} size={14} color={colors.primary} />
          <Text style={[styles.hint, { color: colors.primary }]}>
            {isWhatsApp ? t("auth.otp.hintWhatsapp") : t("auth.otp.hint")}
          </Text>
        </View>

        <View style={styles.resendRow}>
          <Text style={[styles.resendLabel, { color: colors.mutedForeground }]}>
            {isWhatsApp ? t("auth.otp.noCodeWhatsapp") : t("auth.otp.noCode")}
          </Text>
          {canResend ? (
            <TouchableOpacity onPress={handleResend}>
              <Text style={[styles.resendBtn, { color: colors.primary }]}>{t("auth.otp.resend")}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.resendTimer, { color: colors.mutedForeground }]}>{countdown}s</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { paddingHorizontal: 24, paddingBottom: 40 },
  backBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  content: { alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 4 },
  phone: { fontSize: 16, fontWeight: "700", marginBottom: 20 },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  otpRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  otpRowLTR: { flexDirection: "row-reverse" },
  otpBox: { width: 48, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  otpChar: { fontSize: 22, fontWeight: "700" },
  hintBox: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginBottom: 28 },
  hint: { fontSize: 12, fontWeight: "500" },
  resendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resendLabel: { fontSize: 14 },
  resendBtn: { fontSize: 14, fontWeight: "700" },
  resendTimer: { fontSize: 14, fontWeight: "600" },
});
