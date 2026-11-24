import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { Coords, HOMS_CENTER } from "@/utils/geo";
import { mapFrameKey } from "@/components/deliveryMapShared";

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

export function DeliveryMap({ destinationCoords, restaurantCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const mapRef = useRef<MapView>(null);
  const center = destinationCoords ?? restaurantCoords ?? HOMS_CENTER;
  const courier = courierCoords && !isSearching ? courierCoords : null;

  // Frame the whole trip once each point is known. Following every courier ping
  // would fight the customer's own panning and zooming.
  const frameKey = mapFrameKey(destinationCoords, restaurantCoords ?? null, courier);
  useEffect(() => {
    const points = [destinationCoords, restaurantCoords, courier].filter((p): p is Coords => !!p);
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, {
      edgePadding: { top: 60, right: 50, bottom: 40, left: 50 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 0.022,
          longitudeDelta: 0.022,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        toolbarEnabled={false}
        zoomEnabled
        scrollEnabled
        pitchEnabled={true}
        rotateEnabled={false}
      >
        {restaurantCoords && (
          <Marker coordinate={restaurantCoords} title="المطعم" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.restaurantMarker}>
              <MaterialIcons name="restaurant" size={18} color="#fff" />
            </View>
          </Marker>
        )}

        {destinationCoords && (
          <Marker coordinate={destinationCoords} title="عنوان التوصيل" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.homeMarker}>
              <MaterialIcons name="home" size={20} color="#fff" />
            </View>
          </Marker>
        )}

        {courier && (
          <Marker coordinate={courier} title="المندوب" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.courierMarker}>
              <MaterialIcons name="delivery-dining" size={22} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {etaMinutes != null && !isSearching && (
        <View style={styles.etaOverlay}>
          <MaterialIcons name="access-time" size={14} color="#DC2626" />
          <Text style={styles.etaOverlayText}>{etaMinutes} د</Text>
        </View>
      )}
    </View>
  );
}

const pin = {
  alignItems: "center" as const,
  justifyContent: "center" as const,
  borderWidth: 3,
  borderColor: "#fff",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
};

const styles = StyleSheet.create({
  homeMarker: { ...pin, width: 38, height: 38, borderRadius: 19, backgroundColor: "#2563eb" },
  restaurantMarker: { ...pin, width: 34, height: 34, borderRadius: 17, backgroundColor: "#ea580c" },
  courierMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  etaOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  etaOverlayText: { fontSize: 13, fontWeight: "700", color: "#DC2626" },
});
