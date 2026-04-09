import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { useBackIcon } from "@/hooks/useTypography";
import { customFetch } from "@workspace/api-client-react";

type VehicleType = "motorcycle" | "car" | "bicycle";

const VEHICLE_OPTIONS: VehicleType[] = ["motorcycle", "car", "bicycle"];

export default function CourierApplyScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const backIcon = useBackIcon();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const [fullName, setFullName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit =
    fullName.trim().length >= 2 && vehicleType !== null && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (fullName.trim().length < 2) {
        Alert.alert(t("common.error"), t("courierApply.validationName"));
      } else {
        Alert.alert(t("common.error"), t("courierApply.validationVehicle"));
      }
      return;
    }

    setLoading(true);
    try {
      await customFetch("/api/courier/apply", {
        method: "POST",
        body: JSON.stringify({
          fullName: fullName.trim(),
          vehicleType,
          vehiclePlate: vehiclePlate.trim(),
          idNumber: idNumber.trim(),
          notes: notes.trim(),
        }),
      });
      Alert.alert(
        t("courierApply.successTitle"),
        t("courierApply.successMsg"),
        [
          {
            text: "حسناً",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("application_exists")) {
        Alert.alert(t("common.error"), t("profile.courier.pendingTitle"));
        router.back();
      } else if (msg.includes("already_courier")) {
        Alert.alert(t("common.error"), t("profile.courier.badge"));
        router.back();
      } else {
        Alert.alert(t("courierApply.errorTitle"), t("courierApply.errorMsg"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name={backIcon} size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t("courierApply.title")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomPadding + 32, paddingHorizontal: 16, paddingTop: 20, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: "#FFF7F0", borderColor: "#FFD5B0" }]}>
          <MaterialIcons name="delivery-dining" size={36} color="#FF6B00" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heroTitle, { color: "#FF6B00" }]}>
              {t("profile.courier.registerTitle")}
            </Text>
            <Text style={[styles.heroBody, { color: "#995000" }]}>
              {t("profile.courier.registerBody")}
            </Text>
          </View>
        </View>

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Full Name */}
          <FormField label={t("courierApply.fullName")} required colors={colors}>
            <TextInput
              style={[styles.input, { borderColor: fullName.length > 0 ? colors.primary : colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder={t("courierApply.fullNamePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              textAlign="right"
            />
          </FormField>

          {/* Vehicle Type */}
          <FormField label={t("courierApply.vehicleType")} required colors={colors}>
            <View style={styles.vehicleRow}>
              {VEHICLE_OPTIONS.map((v) => {
                const icons: Record<VehicleType, keyof typeof MaterialIcons.glyphMap> = {
                  motorcycle: "two-wheeler",
                  car: "directions-car",
                  bicycle: "directions-bike",
                };
                const selected = vehicleType === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.vehicleOption,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary + "15" : colors.background,
                        flex: 1,
                      },
                    ]}
                    onPress={() => setVehicleType(v)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={icons[v]}
                      size={22}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.vehicleLabel,
                        { color: selected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {t(`courierApply.${v}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormField>

          {/* Vehicle Plate */}
          <FormField label={t("courierApply.vehiclePlate")} colors={colors}>
            <TextInput
              style={[styles.input, { borderColor: vehiclePlate.length > 0 ? colors.primary : colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder={t("courierApply.vehiclePlatePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={vehiclePlate}
              onChangeText={setVehiclePlate}
              autoCapitalize="characters"
              textAlign="right"
            />
          </FormField>

          {/* ID Number */}
          <FormField label={t("courierApply.idNumber")} colors={colors}>
            <TextInput
              style={[styles.input, { borderColor: idNumber.length > 0 ? colors.primary : colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder={t("courierApply.idNumberPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={idNumber}
              onChangeText={setIdNumber}
              keyboardType="numeric"
              textAlign="right"
            />
          </FormField>

          {/* Notes */}
          <FormField label={t("courierApply.notes")} colors={colors}>
            <TextInput
              style={[
                styles.input,
                styles.textarea,
                { borderColor: notes.length > 0 ? colors.primary : colors.border, color: colors.foreground, backgroundColor: colors.background },
              ]}
              placeholder={t("courierApply.notesPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlign="right"
              textAlignVertical="top"
            />
          </FormField>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: canSubmit ? colors.primary : colors.border },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          <MaterialIcons name="send" size={20} color="#fff" />
          <Text style={styles.submitBtnText}>
            {loading ? t("courierApply.submitting") : t("courierApply.submit")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function FormField({
  label,
  required,
  children,
  colors,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        {required && (
          <Text style={[styles.requiredStar, { color: colors.primary }]}>*</Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, margin: -8 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  heroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  heroTitle: { fontSize: 15, fontWeight: "700" },
  heroBody: { fontSize: 13, lineHeight: 18 },
  formCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  field: { gap: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { fontSize: 14, fontWeight: "600" },
  requiredStar: { fontSize: 16, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  textarea: { height: 80, paddingTop: 10 },
  vehicleRow: {
    flexDirection: "row",
    gap: 8,
  },
  vehicleOption: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  vehicleLabel: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
