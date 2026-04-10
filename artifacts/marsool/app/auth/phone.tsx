import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useForwardIcon } from "@/hooks/useTypography";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/lib/apiClient";
import { isValidPhoneNumber } from "libphonenumber-js";
import { COUNTRY_CODES } from "@/data/countryCodes";
import { useAuth } from "@/context/AuthContext";

export default function PhoneScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const forwardIcon = useForwardIcon();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const filteredCountries = countrySearch.trim()
    ? COUNTRY_CODES.filter((c) => {
        const q = countrySearch.toLowerCase();
        return (
          c.nameEn.toLowerCase().includes(q) ||
          c.nameAr.includes(countrySearch) ||
          c.code.includes(q) ||
          c.country.toLowerCase().includes(q)
        );
      })
    : COUNTRY_CODES;

  const digits = phone.replace(/\D/g, "");
  const fullPhone = `${selectedCountry.code}${digits}`;
  const isValid = digits.length > 0 && (() => {
    try { return isValidPhoneNumber(fullPhone); } catch { return false; }
  })();

  const handleContinue = async () => {
    if (!isValid || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const base = getApiBaseUrl();

      // Step 1: send OTP (gateway may be skipped server-side, devCode always returned)
      const sendRes = await fetch(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        Alert.alert(t("auth.phone.errorTitle"), sendData.error ?? t("auth.phone.errorMsg"));
        return;
      }

      // TEMP: auto-verify immediately using devCode — bypasses OTP screen.
      // Restore navigation to /auth/otp once a real SMS gateway is configured.
      const code = sendData.devCode;
      if (!code) {
        // Fallback: show OTP screen if no devCode (real SMS mode)
        router.push({ pathname: "/auth/otp", params: { phone: fullPhone } });
        return;
      }

      // Step 2: verify OTP immediately
      const verifyRes = await fetch(`${base}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone, code }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        Alert.alert(t("auth.phone.errorTitle"), verifyData.error ?? t("auth.phone.errorMsg"));
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (verifyData.isNewUser) {
        router.push({
          pathname: "/auth/name",
          params: { phone: fullPhone, token: verifyData.token, userId: verifyData.user.id },
        });
      } else {
        await signIn(verifyData.token, verifyData.user);
        router.replace("/(tabs)");
      }
    } catch {
      Alert.alert(t("auth.phone.errorTitle"), t("auth.phone.errorMsg"));
    } finally {
      setLoading(false);
    }
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
        <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="delivery-dining" size={48} color="#fff" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {t("auth.phone.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t("auth.phone.subtitle")}
        </Text>

        <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: isValid ? colors.primary : colors.border }]}>
          <TouchableOpacity
            style={[styles.prefix, { borderRightColor: colors.border }]}
            onPress={() => setShowPicker((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.prefixFlag}>{selectedCountry.flag}</Text>
            <Text style={[styles.prefixText, { color: colors.foreground }]}>{selectedCountry.code}</Text>
            <MaterialIcons name="arrow-drop-down" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.foreground }]}
            placeholder={t("auth.phone.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={15}
            autoFocus
            textAlign="left"
          />
        </View>

        {showPicker && (
          <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.pickerSearch, { color: colors.foreground, borderBottomColor: colors.border, backgroundColor: colors.card }]}
              placeholder={i18n.language === "ar" ? "ابحث عن دولة..." : "Search country..."}
              placeholderTextColor={colors.mutedForeground}
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {filteredCountries.map((c) => (
                <TouchableOpacity
                  key={c.country}
                  style={[styles.pickerRow, selectedCountry.country === c.country && { backgroundColor: colors.secondary }]}
                  onPress={() => { setSelectedCountry(c); setShowPicker(false); setCountrySearch(""); setPhone(""); inputRef.current?.focus(); }}
                >
                  <Text style={styles.prefixFlag}>{c.flag}</Text>
                  <Text style={[styles.pickerCode, { color: colors.mutedForeground }]}>{c.code}</Text>
                  <Text style={[styles.pickerCountry, { color: colors.foreground }]}>
                    {i18n.language === "ar" ? c.nameAr : c.nameEn}
                  </Text>
                </TouchableOpacity>
              ))}
              {filteredCountries.length === 0 && (
                <Text style={[styles.pickerCountry, { color: colors.mutedForeground, textAlign: "center", paddingVertical: 16 }]}>
                  {i18n.language === "ar" ? "لا توجد نتائج" : "No results"}
                </Text>
              )}
            </ScrollView>
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: isValid ? colors.primary : colors.muted }]}
          onPress={handleContinue}
          disabled={!isValid || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={[styles.continueBtnText, { color: isValid ? "#fff" : colors.mutedForeground }]}>
                {t("auth.phone.continue")}
              </Text>
              <MaterialIcons name={forwardIcon} size={20} color={isValid ? "#fff" : colors.mutedForeground} />
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          {t("auth.phone.termsPrefix")}{" "}
          <Text style={{ color: colors.primary }} onPress={() => router.push("/legal/terms")}>{t("auth.phone.termsLink")}</Text>
          {t("auth.phone.termsAnd")}
          <Text style={{ color: colors.primary }} onPress={() => router.push("/legal/privacy")}>{t("auth.phone.privacyLink")}</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { paddingHorizontal: 24, alignItems: "center", paddingBottom: 40 },
  logoBox: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: "center", justifyContent: "center", marginBottom: 28,
    shadowColor: "#FF6B00", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 15, marginBottom: 36, textAlign: "center" },
  inputWrapper: {
    flexDirection: "row", alignItems: "center", width: "100%",
    borderRadius: 16, borderWidth: 1.5, marginBottom: 12, overflow: "hidden", height: 58,
  },
  prefix: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    gap: 4, borderRightWidth: 1, height: "100%",
  },
  prefixFlag: { fontSize: 20 },
  prefixText: { fontSize: 15, fontWeight: "600" },
  input: { flex: 1, paddingHorizontal: 14, fontSize: 18, fontWeight: "600", letterSpacing: 1 },
  pickerCard: {
    width: "100%", borderRadius: 14, borderWidth: 1, marginBottom: 12, overflow: "hidden",
  },
  pickerSearch: {
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    borderBottomWidth: 1,
  },
  pickerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  pickerCode: { fontSize: 14, fontWeight: "600", width: 44 },
  pickerCountry: { fontSize: 14, fontWeight: "500" },
  continueBtn: {
    width: "100%", height: 56, borderRadius: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20,
  },
  continueBtnText: { fontSize: 17, fontWeight: "700" },
  terms: { fontSize: 12, textAlign: "center", lineHeight: 18, paddingHorizontal: 16 },
});
