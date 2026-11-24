import React from "react";
import { View } from "react-native";
import { MapContainer, TileLayer, Marker, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coords } from "@/utils/geo";
import { HOMS_CENTER } from "@/utils/geo";

export interface DirectoryPin {
  id: string;
  nameAr: string;
  lat: number;
  lon: number;
  category: string;
}

interface Props {
  places: DirectoryPin[];
  home: Coords | null;
  onSelect: (id: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pin = (name: string) => L.divIcon({
  className: "",
  html: `<div style="background:#DC2626;color:#fff;border:2px solid #fff;border-radius:16px;padding:3px 9px;font:600 12px sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);transform:translate(-50%,-100%);position:absolute;direction:rtl">${esc(name)}</div>`,
  iconSize: [0, 0],
});

/** Web preview of the directory map (the phones use a clustered WebView map). */
export default function DirectoryMap({ places, home, onSelect }: Props) {
  const center = home ?? HOMS_CENTER;
  return (
    <View style={{ flex: 1 }}>
      <MapContainer center={[center.latitude, center.longitude]} zoom={14} style={{ width: "100%", height: "100%" }} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {home && <CircleMarker center={[home.latitude, home.longitude]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }} />}
        {places.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={pin(p.nameAr)} eventHandlers={{ click: () => onSelect(p.id) }} />
        ))}
      </MapContainer>
    </View>
  );
}
