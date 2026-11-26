import React from "react";
import { View } from "react-native";
import { MapContainer, TileLayer, Marker, CircleMarker } from "react-leaflet";
import { TILE_URL } from "@/utils/mapTiles";
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
  logo?: string | null;
}

interface Props {
  places: DirectoryPin[];
  home: Coords | null;
  onSelect: (id: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pin = (name: string, logo?: string | null) => {
  const face = logo
    ? `<div style="width:44px;height:44px;border-radius:50%;border:3px solid #fff;background:#DC2626 url(&quot;${esc(logo)}&quot;) center/cover no-repeat;box-shadow:0 2px 7px rgba(0,0,0,.35)"></div>`
    : `<div style="width:44px;height:44px;border-radius:50%;border:3px solid #fff;background:#DC2626;color:#fff;font:800 18px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 7px rgba(0,0,0,.35)">${esc(name.trim().charAt(0))}</div>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;direction:rtl">${face}<div style="width:0;height:0;border:6px solid transparent;border-top-color:#fff;border-bottom:0;margin-top:-1px"></div><div style="margin-top:2px;background:rgba(255,255,255,.95);color:#111;border-radius:8px;padding:1px 6px;font:700 11px sans-serif;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,.25)">${esc(name)}</div></div>`,
    iconSize: [0, 0],
  });
};

/** Web preview of the directory map (the phones use a clustered WebView map). */
export default function DirectoryMap({ places, home, onSelect }: Props) {
  const center = home ?? HOMS_CENTER;
  return (
    <View style={{ flex: 1 }}>
      <MapContainer center={[center.latitude, center.longitude]} zoom={14} style={{ width: "100%", height: "100%" }} zoomControl={false}>
        <TileLayer url={TILE_URL} />
        {home && <CircleMarker center={[home.latitude, home.longitude]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }} />}
        {places.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={pin(p.nameAr, p.logo)} eventHandlers={{ click: () => onSelect(p.id) }} />
        ))}
      </MapContainer>
    </View>
  );
}
