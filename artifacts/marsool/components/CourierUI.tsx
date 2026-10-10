import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Text from "@/components/AppText";

export const courierPalette = {
  background: "#F3F5F8",
  card: "#FFFFFF",
  foreground: "#172B3A",
  cardForeground: "#172B3A",
  mutedForeground: "#596B7A",
  primary: "#C92535",
  primaryForeground: "#FFFFFF",
  secondary: "#FCECEF",
  secondaryForeground: "#AC2030",
  border: "#DCE3EA",
  input: "#DCE3EA",
  muted: "#EDF1F5",
  accent: "#FCECEF",
  accentForeground: "#AC2030",
  destructive: "#C92535",
  destructiveForeground: "#FFFFFF",
  success: "#16805C",
  successForeground: "#FFFFFF",
  warning: "#B96510",
  warningForeground: "#FFFFFF",
  text: "#172B3A",
  tint: "#C92535",
  radius: 20,
};
export function useCourierColors() {
  return courierPalette;
}

export function CourierHeader({
  title,
  subtitle,
  back = false,
  onRefresh,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.header, { paddingTop: insets.top + 16 }]}>
      <View style={s.headingRow}>
        {back && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={() => router.back()}
            style={s.iconButton}
          >
            <MaterialIcons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>زبوني • شريك التوصيل</Text>
          <Text accessibilityRole="header" style={s.title}>
            {title}
          </Text>
        </View>
        {onRefresh && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="تحديث الطلبات"
            onPress={onRefresh}
            style={s.iconButton}
          >
            <MaterialIcons name="refresh" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    backgroundColor: "#172B3A",
    paddingHorizontal: 20,
    paddingBottom: 22,
    gap: 10,
  },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: { color: "#BECCD7", fontSize: 12, marginBottom: 5 },
  title: { color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "right" },
  subtitle: { color: "#D2DDE5", fontSize: 14, lineHeight: 22 },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#2B414F",
    alignItems: "center",
    justifyContent: "center",
  },
});
