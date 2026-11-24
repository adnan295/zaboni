import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Coords, HOMS_CENTER } from "@/utils/geo";
import { mapFrameKey } from "@/components/deliveryMapShared";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface DeliveryMapProps {
  /** The delivery address the customer picked (not where their phone is right now). */
  destinationCoords: Coords | null;
  /** The restaurant the courier collects from; absent for errands. */
  restaurantCoords?: Coords | null;
  courierCoords: Coords | null;
  isSearching?: boolean;
  etaMinutes?: number | null;
  height?: number;
}

function pinIcon(bg: string, glyph: string, size: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size / 2)}px;box-sizing:border-box;">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const homeIcon = pinIcon("#2563eb", "🏠", 38);
const restaurantIcon = pinIcon("#ea580c", "🍽", 34);

const courierIcon = L.divIcon({
  className: "",
  html: `<div style="width:44px;height:44px;border-radius:50%;background:#DC2626;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(220,38,38,0.45);font-size:22px;transition:all 0.5s ease;">🛵</div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

/** Frames the trip when a point first appears, never on a plain courier ping. */
function MapFramer({ points, frameKey }: { points: Coords[]; frameKey: string }) {
  const map = useMap();
  const prev = useRef("");
  useEffect(() => {
    if (frameKey === prev.current) return;
    prev.current = frameKey;
    if (points.length >= 2) {
      map.fitBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]), { padding: [45, 45], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
    }
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

export function DeliveryMap({ destinationCoords, restaurantCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const center = destinationCoords ?? restaurantCoords ?? HOMS_CENTER;
  const courier = courierCoords && !isSearching ? courierCoords : null;
  const points = [destinationCoords, restaurantCoords ?? null, courier].filter((p): p is Coords => !!p);

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
        <MapFramer points={points} frameKey={mapFrameKey(destinationCoords, restaurantCoords ?? null, courier)} />

        {restaurantCoords && (
          <Marker position={[restaurantCoords.latitude, restaurantCoords.longitude]} icon={restaurantIcon} />
        )}

        {destinationCoords && (
          <Marker position={[destinationCoords.latitude, destinationCoords.longitude]} icon={homeIcon} />
        )}

        {courier && <LiveCourierMarker coords={courier} />}
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
    backgroundColor: "#DC2626",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    zIndex: 1000,
  },
  etaText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
