import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import type { Coords } from "@/utils/geo";

export interface DirectoryPin {
  id: string;
  nameAr: string;
  lat: number;
  lon: number;
  category: string;
}

interface Props {
  places: DirectoryPin[];
  /** The customer's delivery address, shown as a blue dot. */
  home: Coords | null;
  onSelect: (id: string) => void;
}

// Hundreds of places: nearby pins merge into a count until the map is zoomed in.
const MAP_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; }
.leaflet-control-zoom { display: none !important; }
.pin { background: #DC2626; color: #fff; border: 2px solid #fff; border-radius: 16px; padding: 3px 9px; font: 600 12px -apple-system, sans-serif;
       white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,.3); transform: translate(-50%, -100%); position: absolute; direction: rtl; }
.pin:after { content: ""; position: absolute; left: 50%; bottom: -6px; margin-left: -5px; border: 5px solid transparent; border-top-color: #DC2626; border-bottom: 0; }
</style>
</head><body><div id="map"></div>
<script>
var map = L.map('map', { zoomControl: false }).setView([34.7324, 36.7137], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
var cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
map.addLayer(cluster);
var home = null;
var framed = false;
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
window.setData = function (d) {
  cluster.clearLayers();
  d.places.forEach(function (p) {
    var icon = L.divIcon({ className: '', html: '<div class="pin">' + esc(p.nameAr) + '<\\/div>', iconSize: [0, 0] });
    var m = L.marker([p.lat, p.lon], { icon: icon });
    m.on('click', function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', id: p.id })); });
    cluster.addLayer(m);
  });
  if (home) { map.removeLayer(home); home = null; }
  if (d.home) {
    home = L.circleMarker([d.home.lat, d.home.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
  }
  if (!framed) {
    framed = true;
    if (d.home) map.setView([d.home.lat, d.home.lon], 15);
    else if (d.places.length) map.fitBounds(d.places.map(function (p) { return [p.lat, p.lon]; }), { padding: [30, 30] });
  }
};
window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
<\/script></body></html>`;

export default function DirectoryMap({ places, home, onSelect }: Props) {
  const ref = useRef<WebView<unknown>>(null);
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState(0);

  const push = useCallback(() => {
    if (!ready) return;
    const data = {
      places: places.map((p) => ({ id: p.id, nameAr: p.nameAr, lat: p.lat, lon: p.lon })),
      home: home ? { lat: home.latitude, lon: home.longitude } : null,
    };
    ref.current?.injectJavaScript(`window.setData && window.setData(${JSON.stringify(data)}); true;`);
  }, [ready, places, home]);

  useEffect(() => { push(); }, [push]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; id?: string };
      if (msg.type === "ready") setReady(true);
      if (msg.type === "select" && msg.id) onSelect(msg.id);
    } catch {}
  }, [onSelect]);

  return (
    <View style={{ flex: 1 }}>
      <WebView<unknown>
        key={key}
        ref={ref}
        source={{ html: MAP_HTML }}
        style={{ flex: 1 }}
        javaScriptEnabled
        originWhitelist={["*"]}
        onMessage={onMessage}
        onRenderProcessGone={() => { setReady(false); setKey((k) => k + 1); return true; }}
        onContentProcessDidTerminate={() => { setReady(false); setKey((k) => k + 1); }}
      />
    </View>
  );
}
