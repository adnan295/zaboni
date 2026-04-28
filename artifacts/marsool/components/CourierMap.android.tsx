import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";

export interface CourierMapProps {
  destinationLat: number;
  destinationLon: number;
  courierLat?: number | null;
  courierLon?: number | null;
  address?: string;
  onNavigate: () => void;
}

function makeMapHtml(destLat: number, destLon: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; }
.leaflet-control-attribution { display: none !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map', { attributionControl: false }).setView([${destLat}, ${destLon}], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

var destIcon = L.divIcon({
  className: '',
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#DC2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(220,38,38,0.5);"><\\/div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

var courierIcon = L.divIcon({
  className: '',
  html: '<div style="width:44px;height:44px;border-radius:50%;background:#1a73e8;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(26,115,232,0.5);">\\uD83D\\uDEF5<\\/div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

L.marker([${destLat}, ${destLon}], { icon: destIcon }).addTo(map);
var courierMarker = null;

window.updateCourier = function(lat, lng) {
  if (lat == null || lng == null) return;
  if (!courierMarker) {
    courierMarker = L.marker([lat, lng], { icon: courierIcon }).addTo(map);
  } else {
    courierMarker.setLatLng([lat, lng]);
  }
};

window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
<\/script>
</body>
</html>`;
}

export function CourierMap({ destinationLat, destinationLon, courierLat, courierLon }: CourierMapProps) {
  const webViewRef = useRef<WebView>(null);
  const htmlRef = useRef(makeMapHtml(destinationLat, destinationLon));
  const [mapReady, setMapReady] = useState(false);

  const injectCourier = useCallback((ready: boolean) => {
    if (!ready || courierLat == null || courierLon == null) return;
    webViewRef.current?.injectJavaScript(
      `window.updateCourier && window.updateCourier(${courierLat}, ${courierLon}); true;`
    );
  }, [courierLat, courierLon]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string };
      if (msg.type === "ready") {
        setMapReady(true);
        injectCourier(true);
      }
    } catch {}
  }, [injectCourier]);

  useEffect(() => {
    injectCourier(mapReady);
  }, [courierLat, courierLon, mapReady, injectCourier]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlRef.current }}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        onMessage={handleMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
