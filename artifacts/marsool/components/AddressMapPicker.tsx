import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { Coords, RIYADH_CENTER } from "@/utils/geo";

interface AddressMapPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (address: string, coords: Coords) => void;
  initialAddress?: string;
}

export function AddressMapPicker({ visible, onClose, onSelect, initialAddress }: AddressMapPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const [selectedCoords, setSelectedCoords] = useState<Coords>(RIYADH_CENTER);
  const [resolvedAddress, setResolvedAddress] = useState<string>(initialAddress ?? "");
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setSelectedCoords(coords);
          await reverseGeocode(coords);
        }
      } catch {}
    })();
  }, [visible]);

  const reverseGeocode = async (coords: Coords) => {
    setGeocoding(true);
    try {
      const result = await Location.reverseGeocodeAsync(coords);
      if (result && result.length > 0) {
        const r = result[0];
        const parts = [r.street, r.district, r.subregion ?? r.city].filter(Boolean);
        const addr = parts.join("، ") || r.formattedAddress || `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
        setResolvedAddress(addr);
      }
    } catch {
      setResolvedAddress(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
    } finally {
      setGeocoding(false);
    }
  };

  const handleConfirm = () => {
    onSelect(resolvedAddress, selectedCoords);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: "#FF6B00" }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("map.pickerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.webMapContainer}>
          <View style={styles.webMapGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 14.28}%` as unknown as number }]} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 14.28}%` as unknown as number }]} />
            ))}
          </View>
          <View style={styles.webPinCenter}>
            <MaterialIcons name="location-pin" size={64} color="#FF6B00" />
          </View>
          <Text style={styles.webMapHint}>{t("map.webFallback")}</Text>
        </View>

        <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.addressBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <MaterialIcons name="location-on" size={18} color="#FF6B00" />
            <View style={styles.addressTextWrap}>
              {geocoding ? (
                <View style={styles.geocodingRow}>
                  <ActivityIndicator size="small" color="#FF6B00" />
                  <Text style={[styles.geocodingText, { color: colors.mutedForeground }]}>{t("map.locating")}</Text>
                </View>
              ) : (
                <Text style={[styles.resolvedText, { color: colors.foreground }]} numberOfLines={2}>
                  {resolvedAddress || t("map.pickLocation")}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: "#FF6B00", opacity: resolvedAddress && !geocoding ? 1 : 0.5 }]}
            onPress={handleConfirm}
            disabled={!resolvedAddress || geocoding}
          >
            <MaterialIcons name="check" size={20} color="#fff" />
            <Text style={styles.confirmBtnText}>{t("map.confirmLocation")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#fff" },
  webMapContainer: {
    flex: 1,
    backgroundColor: "#e8f0e0",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  webMapGrid: { ...StyleSheet.absoluteFillObject },
  gridH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(180,200,160,0.5)",
  },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(180,200,160,0.5)",
  },
  webPinCenter: { alignItems: "center", justifyContent: "center" },
  webMapHint: {
    marginTop: 12,
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  bottomSheet: {
    padding: 20,
    gap: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  addressTextWrap: { flex: 1 },
  geocodingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  geocodingText: { fontSize: 13 },
  resolvedText: { fontSize: 14, lineHeight: 20, textAlign: "right" },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
