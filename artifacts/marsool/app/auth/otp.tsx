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
  const { phone, devCode } = useLocalSearchParams<{ phone: string; devCode?: string }>();
  const { signIn } = useAuth();
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentDevCode, setCurrentDevCode] = useState(devCode ?? "");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown === 0) { setCanResend(true); return; }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // TEMP: Auto-fill OTP when devCode is present (no SMS gateway yet).
  // Remove this effect once a real SMS gateway is configured.
  useEffect(() => {
    if (currentDevCode && currentDevCode.length === OTP_LENGTH) {
      const timer = setTimeout(() => handleOtpChange(currentDevCode), 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDevCode]);

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

  const handleDevCodeTap = () => {
    if (!currentDevCode) return;
    handleOtpChange(currentDevCode);
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCountdown(60);
    setCanResend(false);
    setOtp("");
    setCurrentDevCode("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.devCode) setCurrentDevCode(data.devCode);
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

        {!!currentDevCode && (
          <TouchableOpacity
            style={styles.devBanner}
            onPress={handleDevCodeTap}
            activeOpacity={0.8}
          >
            <MaterialIcons name="developer-mode" size={16} color="#92400e" />
            <Text style={styles.devBannerLabel}>DEV — الكود التجريبي:</Text>
            <Text style={styles.devBannerCode}>{currentDevCode}</Text>
            <Text style={styles.devBannerTap}>اضغط للملء التلقائي</Text>
          </TouchableOpacity>
        )}

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
          style={styles.otpRow}
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
          <MaterialIcons name="info-outline" size={14} color={colors.primary} />
          <Text style={[styles.hint, { color: colors.primary }]}>{t("auth.otp.hint")}</Text>
        </View>

        <View style={styles.resendRow}>
          <Text style={[styles.resendLabel, { color: colors.mutedForeground }]}>{t("auth.otp.noCode")}</Text>
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
  devBanner: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 6, backgroundColor: "#fef3c7", borderColor: "#f59e0b",
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 10, marginBottom: 20, width: "100%",
  },
  devBannerLabel: { fontSize: 12, color: "#92400e", fontWeight: "600" },
  devBannerCode: { fontSize: 20, fontWeight: "800", color: "#92400e", letterSpacing: 4 },
  devBannerTap: { fontSize: 11, color: "#b45309", fontWeight: "500", width: "100%" },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  otpRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  otpBox: { width: 48, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  otpChar: { fontSize: 22, fontWeight: "700" },
  hintBox: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginBottom: 28 },
  hint: { fontSize: 12, fontWeight: "500" },
  resendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  resendLabel: { fontSize: 14 },
  resendBtn: { fontSize: 14, fontWeight: "700" },
  resendTimer: { fontSize: 14, fontWeight: "600" },
});
