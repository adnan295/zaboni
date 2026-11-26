import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Coords, HOMS_CENTER } from "@/utils/geo";
import { mapFrameKey, ROUTE_DARK, ROUTE_LIGHT, type TripLine } from "@/components/deliveryMapShared";

interface DeliveryMapProps {
  /** The delivery address the customer picked (not where their phone is right now). */
  destinationCoords: Coords | null;
  /** The restaurant the courier collects from; absent for errands. */
  restaurantCoords?: Coords | null;
  courierCoords: Coords | null;
  isSearching?: boolean;
  /** The red line along the streets. */
  route?: TripLine | null;
  height?: number;
  /** Space the bottom sheet covers, so framing keeps every pin visible above it. */
  bottomInset?: number;
}

/**
 * The tracking map on iPhone: Apple's muted map without shops and ads, so the
 * route and the three pins (restaurant, courier, home) are what stands out.
 */
export function DeliveryMap({ destinationCoords, restaurantCoords, courierCoords, isSearching, route, height = 220, bottomInset = 0 }: DeliveryMapProps) {
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
      edgePadding: { top: 130, right: 60, bottom: 60 + bottomInset, left: 60 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  const line = (coords: Coords[] | undefined, color: string, key: string) =>
    coords && coords.length >= 2 ? [
      <Polyline key={`${key}-casing`} coordinates={coords} strokeColor="#FFFFFF" strokeWidth={9} lineCap="round" lineJoin="round" />,
      <Polyline key={key} coordinates={coords} strokeColor={color} strokeWidth={5} lineCap="round" lineJoin="round" />,
    ] : null;

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
        mapType="mutedStandard"
        userInterfaceStyle="light"
        showsPointsOfInterests={false}
        showsBuildings={false}
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
        {line(route?.left, ROUTE_LIGHT, "left")}
        {line(route?.done, ROUTE_DARK, "done")}

        {restaurantCoords && (
          <Marker coordinate={restaurantCoords} title="المطعم" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.restaurantPin}>
              <MaterialIcons name="restaurant" size={15} color="#fff" />
            </View>
          </Marker>
        )}

        {destinationCoords && (
          <Marker coordinate={destinationCoords} title="عنوان التوصيل" anchor={{ x: 0.5, y: 1 }}>
            <View style={{ alignItems: "center" }}>
              <View style={styles.homePin}>
                <MaterialIcons name="home" size={16} color="#fff" />
              </View>
              <View style={styles.homeTip} />
            </View>
          </Marker>
        )}

        {courier && (
          <Marker coordinate={courier} title="المندوب" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.courierHalo}>
              <View style={styles.courierPin}>
                <MaterialIcons name="delivery-dining" size={20} color="#B91C1C" />
              </View>
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const shadow = { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 };

const styles = StyleSheet.create({
  restaurantPin: { ...shadow, width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: "#fff", backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  homePin: { ...shadow, shadowColor: "#DC2626", shadowOpacity: 0.35, width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: "#fff", backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  homeTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#DC2626", marginTop: -1 },
  courierHalo: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(220,38,38,0.18)", alignItems: "center", justifyContent: "center" },
  courierPin: { ...shadow, shadowOpacity: 0.2, width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, borderColor: "#DC2626", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
