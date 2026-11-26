import { getApiBaseUrl } from "@/lib/apiConfig";

/**
 * Street-map tiles through our own server (api-server routes/tiles.ts).
 * OpenStreetMap answers apps that fetch its tiles directly with an
 * "Access blocked" picture, in the in-app browser too. Used as the fallback
 * background and by the small still maps.
 */
export const TILE_URL = `${getApiBaseUrl()}/api/tiles/{z}/{x}/{y}.png`;

/**
 * The look of the Android maps: OpenFreeMap's "Positron" — soft grey streets,
 * no shop clutter, close to Apple's muted map on the iPhone. Free, no key, and
 * allowed in commercial apps.
 */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Scripts and styles for the <head> of a Leaflet map page in a WebView. */
export const MAP_HEAD = `
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"><\/script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js"><\/script>
<style>.leaflet-container{background:#F2F1EE}.leaflet-control-attribution{font-size:9px;opacity:.6}</style>`;

/**
 * JS that puts the soft background under an existing Leaflet map `mapVar`.
 * Place names are shown in Arabic (the style's default writes Latin and Arabic).
 * Phones that cannot draw it (no WebGL) get the plain street tiles instead.
 */
export function baseLayerJs(mapVar: string): string {
  return `
(function () {
  var plain = function () { L.tileLayer('${TILE_URL}', { maxZoom: 19 }).addTo(${mapVar}); };
  try {
    if (!window.maplibregl || !L.maplibreGL) { plain(); return; }
    // Arabic place names need this to join their letters and run right to left.
    try {
      if (maplibregl.getRTLTextPluginStatus && maplibregl.getRTLTextPluginStatus() === 'unavailable') {
        maplibregl.setRTLTextPlugin('https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js', false);
      }
    } catch (e) {}
    var gl = L.maplibreGL({ style: '${MAP_STYLE_URL}', attribution: '© OpenFreeMap © OpenStreetMap' }).addTo(${mapVar});
    var m = gl.getMaplibreMap && gl.getMaplibreMap();
    if (!m) { plain(); return; }
    m.on('error', function () {});
    m.once('styledata', function () {
      (m.getStyle().layers || []).forEach(function (l) {
        if (l.type === 'symbol' && l.layout && l.layout['text-field']) {
          try { m.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:ar'], ['get', 'name']]); } catch (e) {}
        }
      });
    });
  } catch (e) { plain(); }
})();`;
}
