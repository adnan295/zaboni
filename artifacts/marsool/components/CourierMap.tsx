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

export function CourierMap({ destinationLat, destinationLon, address, onNavigate }: CourierMapProps) {
  return (
    <TouchableOpacity onPress={onNavigate} activeOpacity={0.9} style={styles.mapFallback}>
      <MaterialIcons name="map" size={40} color="#DC2626" />
      <Text style={styles.coords}>
        {destinationLat.toFixed(4)}, {destinationLon.toFixed(4)}
      </Text>
      {address ? <Text style={styles.address} numberOfLines={1}>{address}</Text> : null}
      <Text style={styles.tap}>اضغط لفتح الخرائط</Text>
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
  coords: { fontSize: 13, color: "#555", fontFamily: "monospace" },
  address: { fontSize: 12, color: "#888", maxWidth: 240 },
  tap: { fontSize: 12, color: "#DC2626", fontWeight: "600" },
});
