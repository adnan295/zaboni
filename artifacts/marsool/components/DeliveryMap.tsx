import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Coords } from "@/utils/geo";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface DeliveryMapProps {
  userCoords: Coords | null;
  courierCoords: Coords | null;
  isSearching?: boolean;
  etaMinutes?: number | null;
  height?: number;
}

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.25);border:2.5px solid #3b82f6;display:flex;align-items:center;justify-content:center;"><div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;"></div></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const courierIcon = L.divIcon({
  className: "",
  html: `<div style="width:44px;height:44px;border-radius:50%;background:#FF6B00;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,107,0,0.45);font-size:22px;transition:all 0.5s ease;">🛵</div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function MapPanner({ center }: { center: Coords }) {
  const map = useMap();
  const prev = useRef<string>("");
  useEffect(() => {
    const key = `${center.latitude},${center.longitude}`;
    if (key === prev.current) return;
    prev.current = key;
    map.panTo([center.latitude, center.longitude], { animate: true, duration: 0.5 });
  });
  return null;
}

function LiveCourierMarker({ coords }: { coords: Coords }) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([coords.latitude, coords.longitude]);
    }
  }, [coords.latitude, coords.longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[coords.latitude, coords.longitude]}
      icon={courierIcon}
    />
  );
}

export function DeliveryMap({ userCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const center = userCoords ?? { latitude: 24.7136, longitude: 46.6753 };

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {userCoords && (
          <Marker position={[userCoords.latitude, userCoords.longitude]} icon={userIcon} />
        )}

        {courierCoords && !isSearching && (
          <LiveCourierMarker coords={courierCoords} />
        )}
      </MapContainer>

      {etaMinutes != null && !isSearching && (
        <View style={styles.etaBadge} pointerEvents="none">
          <MaterialIcons name="access-time" size={12} color="#fff" />
          <Text style={styles.etaText}>{etaMinutes} د</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  etaBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF6B00",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    zIndex: 1000,
  },
  etaText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
