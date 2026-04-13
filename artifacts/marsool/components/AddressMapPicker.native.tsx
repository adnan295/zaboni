import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { Coords, DAMASCUS_CENTER } from "@/utils/geo";
import MapView, { Marker } from "react-native-maps";

interface AddressMapPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (address: string, coords: Coords) => void;
  initialAddress?: string;
}

export function AddressMapPicker({ visible, onClose, onSelect, initialAddress }: AddressMapPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const [selectedCoords, setSelectedCoords] = useState<Coords>(DAMASCUS_CENTER);
  const [resolvedAddress, setResolvedAddress] = useState<string>(initialAddress ?? "");
  const [geocoding, setGeocoding] = useState(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleMapPress = (event: { nativeEvent: { coordinate: Coords } }) => {
    const coords = event.nativeEvent.coordinate;
    setSelectedCoords(coords);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => reverseGeocode(coords), 600);
  };

  const handleMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setSelectedCoords(coords);
      await reverseGeocode(coords);
    } catch {}
  };

  const handleConfirm = () => {
    onSelect(resolvedAddress, selectedCoords);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: "#DC2626" }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("map.pickerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.mapWrapper}>
          <MapView
            style={styles.map}
            region={{
              latitude: selectedCoords.latitude,
              longitude: selectedCoords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
          >
            <Marker
              coordinate={selectedCoords}
              draggable
              onDragEnd={(e: { nativeEvent: { coordinate: Coords } }) => handleMapPress(e)}
            >
              <View style={styles.pinMarker}>
                <MaterialIcons name="location-pin" size={36} color="#DC2626" />
              </View>
            </Marker>
          </MapView>

          <TouchableOpacity style={styles.myLocationBtn} onPress={handleMyLocation}>
            <MaterialIcons name="my-location" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.addressBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <MaterialIcons name="location-on" size={18} color="#DC2626" />
            <View style={styles.addressTextWrap}>
              {geocoding ? (
                <View style={styles.geocodingRow}>
                  <ActivityIndicator size="small" color="#DC2626" />
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
            style={[styles.confirmBtn, { backgroundColor: "#DC2626", opacity: resolvedAddress && !geocoding ? 1 : 0.5 }]}
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
    paddingTop: Platform.OS === "ios" ? 52 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#fff" },
  mapWrapper: { flex: 1, position: "relative" },
  map: { flex: 1 },
  pinMarker: { alignItems: "center" },
  myLocationBtn: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
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
