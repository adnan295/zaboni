import React, { useRef, useEffect, useState, useCallback } from "react";
import { View } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { Coords } from "@/utils/geo";
import { MAP_GROUND, mapFrameKey, PIN_HTML, ROUTE_DARK, ROUTE_LIGHT, TILE_FILTER, type TripLine } from "@/components/deliveryMapShared";

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
.leaflet-container { background: ${MAP_GROUND}; }
.leaflet-tile-pane { filter: ${TILE_FILTER}; }
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

function htmlIcon(html, w, h, ax, ay) {
  return L.divIcon({ className: '', html: html, iconSize: [w, h], iconAnchor: [ax, ay] });
}
var homeIcon = htmlIcon(${JSON.stringify(PIN_HTML.home)}, 34, 41, 17, 41);
var restaurantIcon = htmlIcon(${JSON.stringify(PIN_HTML.restaurant)}, 32, 32, 16, 16);
var courierIcon = htmlIcon(${JSON.stringify(PIN_HTML.courier)}, 52, 52, 26, 26);
var routeLayers = [];

function place(marker, lat, lng, icon) {
  if (lat == null || lng == null) {
    if (marker) map.removeLayer(marker);
    return null;
  }
  if (!marker) return L.marker([lat, lng], { icon: icon }).addTo(map);
  marker.setLatLng([lat, lng]);
  return marker;
}

function drawRoute(done, left) {
  routeLayers.forEach(function (l) { map.removeLayer(l); });
  routeLayers = [];
  [[left, '${ROUTE_LIGHT}'], [done, '${ROUTE_DARK}']].forEach(function (pair) {
    var pts = pair[0];
    if (!pts || pts.length < 2) return;
    routeLayers.push(L.polyline(pts, { color: '#fff', weight: 9, lineCap: 'round', lineJoin: 'round' }).addTo(map));
    routeLayers.push(L.polyline(pts, { color: pair[1], weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(map));
  });
}

window.updateMarkers = function(data) {
  drawRoute(data.done, data.left);
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
    if (pts.length >= 2) map.fitBounds(pts, { paddingTopLeft: [50, 120], paddingBottomRight: [50, 50 + (data.bottomInset || 0)], maxZoom: 16, animate: true });
    else if (pts.length === 1) map.setView(pts[0], 15, { animate: true });
  }
};

window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
<\/script>
</body>
</html>`;

export function DeliveryMap({ destinationCoords, restaurantCoords, courierCoords, isSearching, route, height = 220, bottomInset = 0 }: DeliveryMapProps) {
  const webViewRef = useRef<WebView<unknown>>(null);
  const [mapReady, setMapReady] = useState(false);
  // Android kills the WebView renderer process under memory pressure or on
  // background/foreground. Without handling that, react-native-webview crashes
  // the WHOLE app. We remount the WebView on that event and never let it crash.
  const [webViewKey, setWebViewKey] = useState(0);

  const injectMarkers = useCallback((ready: boolean) => {
    if (!ready) return;
    const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "null");
    const line = (pts: Coords[] | undefined) =>
      JSON.stringify((pts ?? []).map((p) => [Number(p.latitude.toFixed(6)), Number(p.longitude.toFixed(6))]));
    const courier = courierCoords && !isSearching ? courierCoords : null;
    const payload = `{destLat:${n(destinationCoords?.latitude)},destLng:${n(destinationCoords?.longitude)},` +
      `restLat:${n(restaurantCoords?.latitude)},restLng:${n(restaurantCoords?.longitude)},` +
      `courierLat:${n(courierCoords?.latitude)},courierLng:${n(courierCoords?.longitude)},` +
      `isSearching:${isSearching ? "true" : "false"},frameKey:${JSON.stringify(mapFrameKey(destinationCoords, restaurantCoords ?? null, courier))},` +
      `done:${line(route?.done)},left:${line(route?.left)},bottomInset:${Math.round(bottomInset)}}`;
    webViewRef.current?.injectJavaScript(`window.updateMarkers && window.updateMarkers(${payload}); true;`);
  }, [destinationCoords, restaurantCoords, courierCoords, isSearching, route, bottomInset]);

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
    </View>
  );
}
