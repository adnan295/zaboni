import React, { useState, useEffect, useRef } from "react";
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
import { Coords, DAMASCUS_CENTER } from "@/utils/geo";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L, { LatLng } from "leaflet";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="font-size:42px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📍</div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 42],
});

interface AddressMapPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (address: string, coords: Coords) => void;
  initialAddress?: string;
}

function MapClickCapture({ onPress }: { onPress: (c: Coords) => void }) {
  useMapEvents({
    click(e) {
      onPress({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

function DraggablePin({ coords, onMove }: { coords: Coords; onMove: (c: Coords) => void }) {
  const markerRef = useRef<L.Marker | null>(null);
  const map = useMap();

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([coords.latitude, coords.longitude]);
      map.panTo([coords.latitude, coords.longitude], { animate: true, duration: 0.4 });
    }
  }, [coords.latitude, coords.longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[coords.latitude, coords.longitude]}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend(e) {
          const ll: LatLng = (e.target as L.Marker).getLatLng();
          onMove({ latitude: ll.lat, longitude: ll.lng });
        },
      }}
    />
  );
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
        } else {
          await reverseGeocode(DAMASCUS_CENTER);
        }
      } catch {
        await reverseGeocode(DAMASCUS_CENTER);
      }
    })();
  }, [visible]);

  const reverseGeocode = async (coords: Coords) => {
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
        { headers: { "Accept-Language": "ar,en" } }
      );
      const data = await resp.json() as { display_name?: string; address?: Record<string, string> };
      if (data?.address) {
        const parts = [
          data.address.road,
          data.address.suburb || data.address.neighbourhood,
          data.address.city || data.address.town,
        ].filter(Boolean);
        setResolvedAddress(parts.join("، ") || data.display_name || "");
      } else if (data?.display_name) {
        setResolvedAddress(data.display_name);
      }
    } catch {
      setResolvedAddress(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
    } finally {
      setGeocoding(false);
    }
  };

  const handleMapPress = (coords: Coords) => {
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
          <MapContainer
            center={[selectedCoords.latitude, selectedCoords.longitude]}
            zoom={14}
            style={{ width: "100%", height: "100%" }}
            zoomControl
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapClickCapture onPress={handleMapPress} />
            <DraggablePin coords={selectedCoords} onMove={handleMapPress} />
          </MapContainer>

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
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#fff" },
  mapWrapper: { flex: 1, position: "relative" },
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
    zIndex: 1000,
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
