import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import { default as Text } from "@/components/AppText";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/useColors";
import { Coords, HOMS_CENTER } from "@/utils/geo";
import WebView, { WebViewMessageEvent } from "react-native-webview";

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #map { width: 100%; height: 100%; overflow: hidden; }
.leaflet-control-attribution { font-size: 9px; opacity: 0.7; }
</style>
</head>
<body>
<div id="map"></div>
<script>
var lat = ${HOMS_CENTER.latitude};
var lng = ${HOMS_CENTER.longitude};

var map = L.map('map', { zoomControl: true }).setView([lat, lng], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

var pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:40px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));position:relative;top:-40px;left:-10px;">\\uD83D\\uDCCD<\\/div>',
  iconSize: [36, 40],
  iconAnchor: [18, 40]
});

var marker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(map);

function send(type, data) {
  window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, data || {})));
}

marker.on('dragend', function(e) {
  var ll = e.target.getLatLng();
  send('location', { lat: ll.lat, lng: ll.lng });
});

map.on('click', function(e) {
  marker.setLatLng(e.latlng);
  map.panTo(e.latlng, { animate: true, duration: 0.3 });
  send('location', { lat: e.latlng.lat, lng: e.latlng.lng });
});

window.moveMarker = function(lat, lng) {
  marker.setLatLng([lat, lng]);
  map.setView([lat, lng], 15, { animate: true });
  send('location', { lat: lat, lng: lng });
};

send('ready', {});
<\/script>
</body>
</html>`;

interface AddressMapPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (address: string, coords: Coords) => void;
  initialAddress?: string;
}

export function AddressMapPicker({ visible, onClose, onSelect, initialAddress }: AddressMapPickerProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const webViewRef = useRef<WebView>(null);
  const [selectedCoords, setSelectedCoords] = useState<Coords>(HOMS_CENTER);
  const [resolvedAddress, setResolvedAddress] = useState<string>(initialAddress ?? "");
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedCoordsRef = useRef<Coords>(HOMS_CENTER);

  useEffect(() => {
    if (!visible) {
      setMapReady(false);
      setResolvedAddress(initialAddress ?? "");
    }
  }, [visible]);

  useEffect(() => {
    if (!mapReady) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          webViewRef.current?.injectJavaScript(
            `window.moveMarker(${coords.latitude}, ${coords.longitude}); true;`
          );
        }
      } catch {}
    })();
  }, [mapReady]);

  const reverseGeocode = async (coords: Coords) => {
    setGeocoding(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`,
        { headers: { "Accept-Language": "ar,en" } }
      );
      const data = await resp.json() as { display_name?: string; address?: Record<string, string> };
      if (data?.address) {
        const parts = [
          data.address.road,
          data.address.suburb || data.address.neighbourhood,
          data.address.city || data.address.town,
        ].filter(Boolean);
        setResolvedAddress(parts.join("، ") || data.display_name || "");
      } else if (data?.display_name) {
        setResolvedAddress(data.display_name);
      }
    } catch {
      setResolvedAddress(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
    } finally {
      setGeocoding(false);
    }
  };

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; lat?: number; lng?: number };
      if (msg.type === "ready") {
        setMapReady(true);
      } else if (msg.type === "location" && msg.lat != null && msg.lng != null) {
        const coords = { latitude: msg.lat, longitude: msg.lng };
        setSelectedCoords(coords);
        selectedCoordsRef.current = coords;
        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
        geocodeTimer.current = setTimeout(() => reverseGeocode(coords), 600);
      }
    } catch {}
  }, []);

  const handleMyLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      webViewRef.current?.injectJavaScript(
        `window.moveMarker(${coords.latitude}, ${coords.longitude}); true;`
      );
    } catch {}
  };

  const handleConfirm = () => {
    onSelect(resolvedAddress, selectedCoordsRef.current);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: "#DC2626" }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("map.pickerTitle")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.mapWrapper}>
          {!mapReady && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#DC2626" />
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ html: MAP_HTML }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["*"]}
            mixedContentMode="always"
            onMessage={handleMessage}
          />
          <TouchableOpacity style={styles.myLocationBtn} onPress={handleMyLocation}>
            <MaterialIcons name="my-location" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.addressBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <MaterialIcons name="location-on" size={18} color="#DC2626" />
            <View style={styles.addressTextWrap}>
              {geocoding ? (
                <View style={styles.geocodingRow}>
                  <ActivityIndicator size="small" color="#DC2626" />
                  <Text style={[styles.geocodingText, { color: colors.mutedForeground }]}>{t("map.locating")}</Text>
                </View>
              ) : (
                <Text style={[styles.resolvedText, { color: colors.foreground }]} numberOfLines={2}>
                  {resolvedAddress || t("map.pickLocation")}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: "#DC2626", opacity: resolvedAddress && !geocoding ? 1 : 0.5 }]}
            onPress={handleConfirm}
            disabled={!resolvedAddress || geocoding}
          >
            <MaterialIcons name="check" size={20} color="#fff" />
            <Text style={styles.confirmBtnText}>{t("map.confirmLocation")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#fff" },
  mapWrapper: { flex: 1, position: "relative" },
  map: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    zIndex: 10,
  },
  myLocationBtn: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 1000,
  },
  bottomSheet: {
    padding: 20,
    gap: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  addressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  addressTextWrap: { flex: 1 },
  geocodingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  geocodingText: { fontSize: 13 },
  resolvedText: { fontSize: 14, lineHeight: 20 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
