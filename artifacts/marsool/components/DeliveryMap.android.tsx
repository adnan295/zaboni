import React, { useRef, useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Coords } from "@/utils/geo";
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

var homeMarker = null;
var restaurantMarker = null;
var courierMarker = null;
var lastFrame = '';

function pinIcon(bg, glyph, size) {
  return L.divIcon({
    className: '',
    html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + bg + ';border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size / 2) + 'px;box-sizing:border-box;">' + glyph + '<\\/div>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}
var homeIcon = pinIcon('#2563eb', '\\uD83C\\uDFE0', 38);
var restaurantIcon = pinIcon('#ea580c', '\\uD83C\\uDF7D', 34);

var courierIcon = L.divIcon({
  className: '',
  html: '<div style="width:44px;height:44px;border-radius:50%;background:#DC2626;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 6px rgba(220,38,38,0.4);">\\uD83D\\uDEF5<\\/div>',
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

function place(marker, lat, lng, icon) {
  if (lat == null || lng == null) {
    if (marker) map.removeLayer(marker);
    return null;
  }
  if (!marker) return L.marker([lat, lng], { icon: icon }).addTo(map);
  marker.setLatLng([lat, lng]);
  return marker;
}

window.updateMarkers = function(data) {
  homeMarker = place(homeMarker, data.destLat, data.destLng, homeIcon);
  restaurantMarker = place(restaurantMarker, data.restLat, data.restLng, restaurantIcon);
  var showCourier = !data.isSearching;
  courierMarker = place(courierMarker, showCourier ? data.courierLat : null, showCourier ? data.courierLng : null, courierIcon);

  // Re-frame only when a point first appears, not on every courier ping, so the
  // customer's own zoom is not undone every few seconds.
  if (data.frameKey !== lastFrame) {
    lastFrame = data.frameKey;
    var pts = [];
    if (data.destLat != null) pts.push([data.destLat, data.destLng]);
    if (data.restLat != null) pts.push([data.restLat, data.restLng]);
    if (showCourier && data.courierLat != null) pts.push([data.courierLat, data.courierLng]);
    if (pts.length >= 2) map.fitBounds(pts, { padding: [45, 45], maxZoom: 16, animate: true });
    else if (pts.length === 1) map.setView(pts[0], 15, { animate: true });
  }
};

window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
<\/script>
</body>
</html>`;

export function DeliveryMap({ destinationCoords, restaurantCoords, courierCoords, isSearching, etaMinutes, height = 220 }: DeliveryMapProps) {
  const webViewRef = useRef<WebView<unknown>>(null);
  const [mapReady, setMapReady] = useState(false);
  // Android kills the WebView renderer process under memory pressure or on
  // background/foreground. Without handling that, react-native-webview crashes
  // the WHOLE app. We remount the WebView on that event and never let it crash.
  const [webViewKey, setWebViewKey] = useState(0);

  const injectMarkers = useCallback((ready: boolean) => {
    if (!ready) return;
    const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "null");
    const courier = courierCoords && !isSearching ? courierCoords : null;
    const payload = `{destLat:${n(destinationCoords?.latitude)},destLng:${n(destinationCoords?.longitude)},` +
      `restLat:${n(restaurantCoords?.latitude)},restLng:${n(restaurantCoords?.longitude)},` +
      `courierLat:${n(courierCoords?.latitude)},courierLng:${n(courierCoords?.longitude)},` +
      `isSearching:${isSearching ? "true" : "false"},frameKey:${JSON.stringify(mapFrameKey(destinationCoords, restaurantCoords ?? null, courier))}}`;
    webViewRef.current?.injectJavaScript(`window.updateMarkers && window.updateMarkers(${payload}); true;`);
  }, [destinationCoords, restaurantCoords, courierCoords, isSearching]);

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
  }, [mapReady, injectMarkers]);

  return (
    <View style={{ height, overflow: "hidden" }}>
      <WebView<unknown>
        key={webViewKey}
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        style={{ flex: 1 }}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        scrollEnabled={false}
        onMessage={handleMessage}
        // Android-only: when the renderer process is gone, recover by remounting
        // the WebView instead of letting it crash the app. Returning true marks
        // the event handled so react-native-webview does not rethrow.
        onRenderProcessGone={() => {
          setMapReady(false);
          setWebViewKey((k) => k + 1);
          return true;
        }}
        onError={() => {
          setMapReady(false);
        }}
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
