import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";

export interface CourierMapProps {
  destinationLat: number;
  destinationLon: number;
  courierLat?: number | null;
  courierLon?: number | null;
  address?: string;
  onNavigate: () => void;
}

export function CourierMap({ address, onNavigate }: CourierMapProps) {
  return (
    <TouchableOpacity onPress={onNavigate} activeOpacity={0.9} style={styles.mapFallback}>
      <MaterialIcons name="map" size={40} color="#DC2626" />
      {/* The place, in words — raw coordinates mean nothing to a courier. */}
      <Text style={styles.address} numberOfLines={2}>{address || "مكان التوصيل"}</Text>
      <Text style={styles.tap}>اكبس لتفتح الخريطة</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 16,
    minHeight: 140,
  },
  address: { fontSize: 15, color: "#111827", fontWeight: "700", maxWidth: 260, textAlign: "center" },
  tap: { fontSize: 12, color: "#DC2626", fontWeight: "600" },
});
