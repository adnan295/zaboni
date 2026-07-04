import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Coords } from "@/utils/geo";

interface DeliveryMapProps {
  userCoords: Coords | null;
  courierCoords: Coords | null;
  isSearching?: boolean;
  etaMinutes?: number | null;
  height?: number;
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; }
.leaflet-control-zoom { display: none !important; }
.leaflet-control-attribution { font-size: 9px; opacity: 0.7; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: false }).setView([34.7324, 36.7137], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

var userMarker = null;
var courierMarker = null;

var userIcon = L.divIcon({
  className: '',
  html: '<div style="width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,0.25);border:2.5px solid #3b82f6;display:flex;align-items:center;justify-content:center;box-sizing:border-box;"><div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;"><\\/div><\\/div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

var courierIcon = L.divIcon({
  className: '',
  html: '<div style="width:44px;height:44px;border-radius:50%;background:#DC2626;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 6px rgba(220,38,38,0.4);">\\uD83D\\uDEF5<\\/div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

window.updateMarkers = function(data) {
  if (data.userLat != null && data.userLng != null) {
    if (!userMarker) {
      userMarker = L.marker([data.userLat, data.userLng], { icon: userIcon }).addTo(map);
    } else {
      userMarker.setLatLng([data.userLat, data.userLng]);
    }
    map.setView([data.userLat, data.userLng], 14, { animate: true });
  }
  if (data.courierLat != null && data.courierLng != null && !data.isSearching) {
    if (!courierMarker) {
      courierMarker = L.marker([data.courierLat, data.courierLng], { icon: courierIcon }).addTo(map);
    } else {
      courierMarker.setLatLng([data.courierLat, data.courierLng]);
    }
  } else if (courierMarker && data.isSearching) {
    map.removeLayer(courierMarker);
    courierMarker = null;
  }
};

window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
<\/script>
</body>
</html>`;

export function DeliveryMap({ userCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);

  const injectMarkers = useCallback((ready: boolean) => {
    if (!ready) return;
    const uLat = userCoords?.latitude ?? "null";
    const uLng = userCoords?.longitude ?? "null";
    const cLat = courierCoords?.latitude ?? "null";
    const cLng = courierCoords?.longitude ?? "null";
    const script = `window.updateMarkers && window.updateMarkers({userLat:${uLat},userLng:${uLng},courierLat:${cLat},courierLng:${cLng},isSearching:${isSearching ?? false}}); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, [userCoords, courierCoords, isSearching]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string };
      if (msg.type === "ready") {
        setMapReady(true);
        injectMarkers(true);
      }
    } catch {}
  }, [injectMarkers]);

  useEffect(() => {
    injectMarkers(mapReady);
  }, [userCoords, courierCoords, isSearching, mapReady, injectMarkers]);

  return (
    <View style={{ height, overflow: "hidden" }}>
      <WebView
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        scrollEnabled={false}
        onMessage={handleMessage}
      />
      {etaMinutes != null && !isSearching && (
        <View style={styles.etaOverlay}>
          <MaterialIcons name="access-time" size={14} color="#DC2626" />
          <Text style={styles.etaOverlayText}>{etaMinutes} د</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
