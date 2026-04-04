import React from "react";
import { View, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { Coords } from "@/utils/geo";

interface DeliveryMapProps {
  userCoords: Coords | null;
  courierCoords: Coords | null;
  isSearching?: boolean;
  etaMinutes?: number | null;
  height?: number;
}

export function DeliveryMap({ userCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const center = userCoords ?? { latitude: 33.5138, longitude: 36.2765 };

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapView
        style={{ flex: 1 }}
        region={{
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
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {userCoords && (
          <Marker
            coordinate={userCoords}
            title="موقعك"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userMarker}>
              <View style={styles.userMarkerOuter}>
                <View style={styles.userMarkerInner} />
              </View>
            </View>
          </Marker>
        )}

        {courierCoords && !isSearching && (
          <Marker
            coordinate={courierCoords}
            title="المندوب"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.courierMarker}>
              <MaterialIcons name="delivery-dining" size={22} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {etaMinutes != null && !isSearching && (
        <View style={styles.etaOverlay}>
          <MaterialIcons name="access-time" size={14} color="#FF6B00" />
          <Text style={styles.etaOverlayText}>{etaMinutes} د</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  userMarker: { alignItems: "center", justifyContent: "center" },
  userMarkerOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(59,130,246,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#3b82f6",
  },
  userMarkerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3b82f6",
  },
  courierMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FF6B00",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B00",
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
  etaOverlayText: { fontSize: 13, fontWeight: "700", color: "#FF6B00" },
});
