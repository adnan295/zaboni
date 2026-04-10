import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

(L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"] = undefined;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const PIN_ICON = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:32px;height:42px">
    <div style="width:32px;height:32px;background:#FF6B00;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:16px">🍽️</span>
    </div>
    <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid #FF6B00"></div>
  </div>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const DAMASCUS: [number, number] = [33.5138, 36.2765];

interface Props {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number, lon: number) => void;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

function FlyTo({ lat, lon }: { lat: number | null; lon: number | null }) {
  const map = useMap();
  const didFly = useRef(false);
  useEffect(() => {
    if (!didFly.current && lat !== null && lon !== null) {
      map.setView([lat, lon], 15);
      didFly.current = true;
    }
  }, [lat, lon, map]);
  return null;
}

export default function LocationPicker({ lat, lon, onChange }: Props) {
  const center: [number, number] = lat !== null && lon !== null ? [lat, lon] : DAMASCUS;
  const hasPin = lat !== null && lon !== null;

  return (
    <div className="col-span-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">موقع المطعم على الخريطة</span>
        {hasPin ? (
          <span className="text-xs text-muted-foreground font-mono">
            {lat!.toFixed(5)}, {lon!.toFixed(5)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">انقر على الخريطة لتحديد الموقع</span>
        )}
      </div>
      <div className="rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
        <MapContainer
          center={center}
          zoom={hasPin ? 15 : 12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onChange={onChange} />
          <FlyTo lat={lat} lon={lon} />
          {hasPin && (
            <Marker
              position={[lat!, lon!]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend(e) {
                  const { lat: la, lng: lo } = (e.target as L.Marker).getLatLng();
                  onChange(Number(la.toFixed(6)), Number(lo.toFixed(6)));
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        انقر على الخريطة أو اسحب الدبوس لتحديد موقع المطعم بدقة
      </p>
    </div>
  );
}
