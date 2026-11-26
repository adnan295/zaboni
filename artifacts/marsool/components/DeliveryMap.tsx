import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Coords, HOMS_CENTER } from "@/utils/geo";
import { MAP_GROUND, mapFrameKey, PIN_HTML, ROUTE_DARK, ROUTE_LIGHT, TILE_FILTER, type TripLine } from "@/components/deliveryMapShared";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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

const htmlIcon = (html: string, w: number, h: number, ax: number, ay: number) =>
  L.divIcon({ className: "", html, iconSize: [w, h], iconAnchor: [ax, ay] });

const homeIcon = htmlIcon(PIN_HTML.home, 34, 41, 17, 41);
const restaurantIcon = htmlIcon(PIN_HTML.restaurant, 32, 32, 16, 16);
const courierIcon = htmlIcon(PIN_HTML.courier, 52, 52, 26, 26);

// The washed-out look of the street tiles (see deliveryMapShared).
if (typeof document !== "undefined" && !document.getElementById("zaboni-map-style")) {
  const el = document.createElement("style");
  el.id = "zaboni-map-style";
  el.textContent = `.zaboni-map{background:${MAP_GROUND}}.zaboni-map .leaflet-tile-pane{filter:${TILE_FILTER}}`;
  document.head.appendChild(el);
}

/** Frames the trip when a point first appears, never on a plain courier ping. */
function MapFramer({ points, frameKey, bottomInset }: { points: Coords[]; frameKey: string; bottomInset: number }) {
  const map = useMap();
  const prev = useRef("");
  useEffect(() => {
    if (frameKey === prev.current) return;
    prev.current = frameKey;
    if (points.length >= 2) {
      map.fitBounds(points.map((p) => [p.latitude, p.longitude] as [number, number]), { paddingTopLeft: [50, 120], paddingBottomRight: [50, 50 + bottomInset], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
    }
  });
  return null;
}

function LiveCourierMarker({ coords }: { coords: Coords }) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([coords.latitude, coords.longitude]);
    }
  }, [coords.latitude, coords.longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[coords.latitude, coords.longitude]}
      icon={courierIcon}
    />
  );
}

export function DeliveryMap({ destinationCoords, restaurantCoords, courierCoords, isSearching, route, height = 220, bottomInset = 0 }: DeliveryMapProps) {
  const center = destinationCoords ?? restaurantCoords ?? HOMS_CENTER;
  const courier = courierCoords && !isSearching ? courierCoords : null;
  const points = [destinationCoords, restaurantCoords ?? null, courier].filter((p): p is Coords => !!p);

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
        className="zaboni-map"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapFramer points={points} frameKey={mapFrameKey(destinationCoords, restaurantCoords ?? null, courier)} bottomInset={bottomInset} />
        {([["left", route?.left, ROUTE_LIGHT], ["done", route?.done, ROUTE_DARK]] as const).map(([k, pts, color]) =>
          pts && pts.length >= 2 ? (
            <React.Fragment key={k}>
              <Polyline positions={pts.map((p) => [p.latitude, p.longitude] as [number, number])} pathOptions={{ color: "#fff", weight: 9, lineCap: "round", lineJoin: "round" }} />
              <Polyline positions={pts.map((p) => [p.latitude, p.longitude] as [number, number])} pathOptions={{ color, weight: 5, lineCap: "round", lineJoin: "round" }} />
            </React.Fragment>
          ) : null)}

        {restaurantCoords && (
          <Marker position={[restaurantCoords.latitude, restaurantCoords.longitude]} icon={restaurantIcon} />
        )}

        {destinationCoords && (
          <Marker position={[destinationCoords.latitude, destinationCoords.longitude]} icon={homeIcon} />
        )}

        {courier && <LiveCourierMarker coords={courier} />}
      </MapContainer>

    </View>
  );
}
