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

const COUNTRY_CODES = [
  { flag: "🇸🇦", code: "+966", country: "SA", nameAr: "السعودية",   nameEn: "Saudi Arabia" },
  { flag: "🇦🇪", code: "+971", country: "AE", nameAr: "الإمارات",   nameEn: "UAE" },
  { flag: "🇪🇬", code: "+20",  country: "EG", nameAr: "مصر",        nameEn: "Egypt" },
  { flag: "🇯🇴", code: "+962", country: "JO", nameAr: "الأردن",     nameEn: "Jordan" },
  { flag: "🇰🇼", code: "+965", country: "KW", nameAr: "الكويت",     nameEn: "Kuwait" },
  { flag: "🇶🇦", code: "+974", country: "QA", nameAr: "قطر",        nameEn: "Qatar" },
  { flag: "🇧🇭", code: "+973", country: "BH", nameAr: "البحرين",    nameEn: "Bahrain" },
  { flag: "🇴🇲", code: "+968", country: "OM", nameAr: "عُمان",      nameEn: "Oman" },
  { flag: "🇺🇸", code: "+1",   country: "US", nameAr: "أمريكا",     nameEn: "USA" },
  { flag: "🇬🇧", code: "+44",  country: "GB", nameAr: "بريطانيا",   nameEn: "UK" },
  { flag: "🇩🇪", code: "+49",  country: "DE", nameAr: "ألمانيا",    nameEn: "Germany" },
  { flag: "🇫🇷", code: "+33",  country: "FR", nameAr: "فرنسا",      nameEn: "France" },
  { flag: "🇹🇷", code: "+90",  country: "TR", nameAr: "تركيا",      nameEn: "Turkey" },
  { flag: "🇮🇳", code: "+91",  country: "IN", nameAr: "الهند",      nameEn: "India" },
  { flag: "🇵🇰", code: "+92",  country: "PK", nameAr: "باكستان",    nameEn: "Pakistan" },
];

export default function PhoneScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const forwardIcon = useForwardIcon();
  const [phone, setPhone] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

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
      const res = await fetch(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert(t("auth.phone.errorTitle"), err.error ?? t("auth.phone.errorMsg"));
        return;
      }
      router.push({ pathname: "/auth/otp", params: { phone: fullPhone } });
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
            <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
              {COUNTRY_CODES.map((c) => (
                <TouchableOpacity
                  key={c.country}
                  style={[styles.pickerRow, selectedCountry.country === c.country && { backgroundColor: colors.secondary }]}
                  onPress={() => { setSelectedCountry(c); setShowPicker(false); setPhone(""); inputRef.current?.focus(); }}
                >
                  <Text style={styles.prefixFlag}>{c.flag}</Text>
                  <Text style={[styles.pickerCode, { color: colors.mutedForeground }]}>{c.code}</Text>
                  <Text style={[styles.pickerCountry, { color: colors.foreground }]}>
                    {i18n.language === "ar" ? c.nameAr : c.nameEn}
                  </Text>
                </TouchableOpacity>
              ))}
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
          <Text style={{ color: colors.primary }}>{t("auth.phone.termsLink")}</Text>
          {t("auth.phone.termsAnd")}
          <Text style={{ color: colors.primary }}>{t("auth.phone.privacyLink")}</Text>
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
