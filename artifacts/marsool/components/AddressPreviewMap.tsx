import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { getApiBaseUrl } from "@/lib/apiConfig";

const TILE = 256;

/** Map tile indexes (fractional) for a point at a zoom level — the standard web-map projection. */
export function tileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

interface Props {
  latitude: number;
  longitude: number;
  height?: number;
  zoom?: number;
  pinColor: string;
}

/**
 * A still picture of the streets around the delivery address with a pin on it,
 * built from a few map tiles — no live map, so it is light enough for checkout
 * and looks the same on iPhone, Android and the web.
 */
export default function AddressPreviewMap({ latitude, longitude, height = 112, zoom = 16, pinColor }: Props) {
  const [width, setWidth] = useState(0);
  const { x, y } = tileXY(latitude, longitude, zoom);
  const cx = x * TILE;
  const cy = y * TILE;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const tiles: { key: string; uri: string; dx: number; dy: number }[] = [];
  if (width > 0) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        tiles.push({
          key: `${tx}-${ty}`,
          // Through our server: OpenStreetMap blocks apps that fetch its tiles directly.
          uri: `${getApiBaseUrl()}/api/tiles/${zoom}/${tx}/${ty}.png`,
          dx: tx * TILE - left,
          dy: ty * TILE - top,
        });
      }
    }
  }
  return (
    <View
      style={[styles.box, { height }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessibilityRole="image"
      accessibilityLabel="مكان التوصيل على الخريطة"
    >
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.uri }}
          style={{ position: "absolute", width: TILE, height: TILE, left: t.dx, top: t.dy }}
          transition={150}
          cachePolicy="memory-disk"
        />
      ))}
      {/* The pin's tip sits on the address. */}
      <View pointerEvents="none" style={[styles.pin, { left: width / 2 - 17, top: height / 2 - 40 }]}>
        <View style={[styles.pinHead, { backgroundColor: pinColor }]}>
          <MaterialIcons name="home" size={16} color="#fff" />
        </View>
        <View style={[styles.pinTip, { borderTopColor: pinColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", overflow: "hidden", backgroundColor: "#EEF0EC" },
  pin: { position: "absolute", alignItems: "center" },
  pinHead: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#DC2626", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  pinTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
});
