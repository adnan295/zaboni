import React from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

export interface CourierMapProps {
  destinationLat: number;
  destinationLon: number;
  courierLat?: number | null;
  courierLon?: number | null;
  address?: string;
  onNavigate: () => void;
}

export function CourierMap({ destinationLat, destinationLon, courierLat, courierLon, address }: CourierMapProps) {
  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: destinationLat,
          longitude: destinationLon,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        scrollEnabled
        zoomEnabled
        pitchEnabled
        rotateEnabled={false}
      >
        <Marker
          coordinate={{ latitude: destinationLat, longitude: destinationLon }}
          pinColor="#DC2626"
          title={address || "وجهة التوصيل"}
        />
        {courierLat != null && courierLon != null && (
          <Marker
            coordinate={{ latitude: courierLat, longitude: courierLon }}
            pinColor="#1a73e8"
            title="موقعك الحالي"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
