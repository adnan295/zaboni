import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CourierLocation, type ActiveOrderLocation } from "@/lib/api";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default marker icon paths (broken by Vite bundler)
// Cast through unknown first to avoid TS2352 on the Leaflet prototype type
(L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"] = undefined;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── Icons ──────────────────────────────────────────────────────────────────

function makeDiv(bg: string, emoji: string, size: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${bg};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.48)}px;box-shadow:0 2px 8px rgba(0,0,0,0.35)">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  });
}

const ICONS = {
  courierOnline: makeDiv("#DC2626", "🛵", 36),
  courierOffline: makeDiv("#9ca3af", "🛵", 30),
  // destination markers by status
  searching:  makeDiv("#6366f1", "📍", 30),
  accepted:   makeDiv("#f59e0b", "📍", 30),
  picked_up:  makeDiv("#3b82f6", "📍", 30),
  on_way:     makeDiv("#10b981", "📍", 30),
  // restaurant
  restaurant: makeDiv("#ef4444", "🍽️", 30),
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DAMASCUS: [number, number] = [33.5138, 36.2765];
const DAMASCUS_CENTER_LAT = 33.5138;
const DAMASCUS_CENTER_LON = 36.2765;

const STATUS_LABELS: Record<string, string> = {
  searching: "يبحث عن مندوب",
  accepted: "قبِل المندوب",
  picked_up: "جارٍ التوصيل",
  on_way: "في الطريق",
};

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-indigo-100 text-indigo-700",
  accepted: "bg-amber-100 text-amber-700",
  picked_up: "bg-blue-100 text-blue-700",
  on_way: "bg-emerald-100 text-emerald-700",
};

// ─── Auto-fit bounds on every update ────────────────────────────────────────

type FitBoundsProps = {
  couriers: CourierLocation[];
  orders: ActiveOrderLocation[];
};

function FitBounds({ couriers, orders }: FitBoundsProps) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    const points: [number, number][] = [];
    for (const c of couriers) points.push([c.lat, c.lon]);
    for (const o of orders) {
      if (o.destinationLat != null && o.destinationLon != null) {
        const isDamascusDefault =
          Math.abs(o.destinationLat - DAMASCUS_CENTER_LAT) < 0.0001 &&
          Math.abs(o.destinationLon - DAMASCUS_CENTER_LON) < 0.0001;
        if (!isDamascusDefault) points.push([o.destinationLat, o.destinationLon]);
      }
      if (o.restaurantLat != null && o.restaurantLon != null) {
        points.push([o.restaurantLat, o.restaurantLon]);
      }
    }

    if (points.length === 0) return;

    // Fit bounds on every polling refresh so the viewport stays up to date
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
    }
    didFit.current = true;
  }, [couriers, orders, map]);

  return null;
}

// ─── Popups ──────────────────────────────────────────────────────────────────

function CourierPopup({ c }: { c: CourierLocation }) {
  return (
    <div dir="rtl" style={{ minWidth: 200, fontSize: 13 }}>
      <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{c.name || "مندوب"}</p>
      <p style={{ color: "#6b7280", fontFamily: "monospace", fontSize: 12, marginBottom: 4 }}>{c.phone}</p>
      <p style={{ marginBottom: 4 }}>
        <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.isOnline ? "#dcfce7" : "#f3f4f6", color: c.isOnline ? "#15803d" : "#6b7280" }}>
          {c.isOnline ? "متصل" : "غير متصل"}
        </span>
      </p>
      <p style={{ fontSize: 12 }}>توصيلات اليوم: <strong>{c.todayDeliveries}</strong></p>
      {c.locationUpdatedAt && (
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
          آخر تحديث: {new Date(c.locationUpdatedAt).toLocaleTimeString("ar-SY")}
        </p>
      )}
      {c.currentOrder && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#DC2626", marginBottom: 4 }}>الطلب الحالي:</p>
          <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#fff7ed", color: "#c2410c" }}>
            {STATUS_LABELS[c.currentOrder.status] ?? c.currentOrder.status}
          </span>
          {c.currentOrder.restaurantName && (
            <p style={{ fontSize: 12, marginTop: 4 }}>من: <strong>{c.currentOrder.restaurantName}</strong></p>
          )}
          {c.currentOrder.customerName && (
            <p style={{ fontSize: 12 }}>للعميل: <strong>{c.currentOrder.customerName}</strong></p>
          )}
          {c.currentOrder.address && (
            <p style={{ fontSize: 11, color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.currentOrder.address}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OrderDestPopup({ o }: { o: ActiveOrderLocation }) {
  return (
    <div dir="rtl" style={{ minWidth: 200, fontSize: 13 }}>
      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>نقطة التسليم</p>
      <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#eff6ff", color: "#1d4ed8" }}>
        {STATUS_LABELS[o.status] ?? o.status}
      </span>
      {o.restaurantName && (
        <p style={{ fontSize: 12, marginTop: 6 }}>المطعم: <strong>{o.restaurantName}</strong></p>
      )}
      {o.customerName && (
        <p style={{ fontSize: 12 }}>العميل: <strong>{o.customerName}</strong></p>
      )}
      {o.customerPhone && (
        <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{o.customerPhone}</p>
      )}
      {o.courierName && (
        <p style={{ fontSize: 12 }}>المندوب: <strong>{o.courierName}</strong></p>
      )}
      {o.address && (
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{o.address}</p>
      )}
      {o.orderText && (
        <p style={{ fontSize: 11, color: "#374151", marginTop: 4, maxWidth: 220 }}>{o.orderText.substring(0, 100)}{o.orderText.length > 100 ? "..." : ""}</p>
      )}
    </div>
  );
}

function RestaurantPopup({ o }: { o: ActiveOrderLocation }) {
  return (
    <div dir="rtl" style={{ minWidth: 200, fontSize: 13 }}>
      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📍 موقع المطعم</p>
      <p style={{ fontSize: 13 }}><strong>{o.restaurantName}</strong></p>
      <span style={{ padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#fef9c3", color: "#92400e", marginTop: 4, display: "inline-block" }}>
        {STATUS_LABELS[o.status] ?? o.status}
      </span>
      {o.customerName && (
        <p style={{ fontSize: 12, marginTop: 6 }}>العميل: <strong>{o.customerName}</strong></p>
      )}
      {o.courierName ? (
        <p style={{ fontSize: 12, marginTop: 2 }}>المندوب: <strong>{o.courierName}</strong></p>
      ) : (
        <p style={{ fontSize: 12, marginTop: 2, color: "#6366f1" }}>لم يُسنَد بعد</p>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LiveMap() {
  const { data: couriers = [], isLoading: loadingCouriers, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "couriers", "locations"],
    queryFn: api.getCourierLocations,
    refetchInterval: 15_000,
  });

  const { data: activeOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["admin", "orders", "active-locations"],
    queryFn: api.getActiveOrderLocations,
    refetchInterval: 15_000,
  });

  const isLoading = loadingCouriers || loadingOrders;
  const onlineCouriers = couriers.filter((c) => c.isOnline);
  const offlineCouriers = couriers.filter((c) => !c.isOnline);

  // Destination markers: only orders where destination differs from Damascus default
  const destOrders = activeOrders.filter(
    (o) =>
      o.destinationLat != null &&
      o.destinationLon != null &&
      !(Math.abs(o.destinationLat - DAMASCUS_CENTER_LAT) < 0.0001 &&
        Math.abs(o.destinationLon - DAMASCUS_CENTER_LON) < 0.0001),
  );

  // Restaurant markers: only orders where restaurant has coordinates
  const restaurantOrders = activeOrders.filter(
    (o) => o.restaurantLat != null && o.restaurantLon != null,
  );

  const isEmpty = couriers.length === 0 && activeOrders.length === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">الخريطة الحية</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            مواقع المندوبين والطلبات النشطة · تتحدث كل 15 ثانية
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
            مندوب متصل ({onlineCouriers.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
            مندوب غير متصل ({offlineCouriers.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            مطعم
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
            وجهة
          </span>
          <span className="flex items-center gap-1.5">
            طلبات نشطة ({activeOrders.length})
          </span>
          {dataUpdatedAt > 0 && (
            <span className="text-muted-foreground">
              آخر تحديث: {new Date(dataUpdatedAt).toLocaleTimeString("ar-SY")}
            </span>
          )}
        </div>
      </div>

      {/* Map */}
      {isLoading ? (
        <div className="border rounded-xl bg-card shadow-sm h-[540px] flex items-center justify-center">
          <p className="text-muted-foreground">جاري تحميل الخريطة...</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm" style={{ height: 540 }}>
          <MapContainer center={DAMASCUS} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitBounds couriers={couriers} orders={activeOrders} />

            {/* Courier markers */}
            {couriers.map((c) => (
              <Marker key={`courier-${c.id}`} position={[c.lat, c.lon]} icon={c.isOnline ? ICONS.courierOnline : ICONS.courierOffline}>
                <Popup maxWidth={260}><CourierPopup c={c} /></Popup>
              </Marker>
            ))}

            {/* Restaurant markers */}
            {restaurantOrders.map((o) => (
              <Marker
                key={`restaurant-${o.id}`}
                position={[o.restaurantLat!, o.restaurantLon!]}
                icon={ICONS.restaurant}
              >
                <Popup maxWidth={240}><RestaurantPopup o={o} /></Popup>
              </Marker>
            ))}

            {/* Destination markers */}
            {destOrders.map((o) => (
              <Marker
                key={`dest-${o.id}`}
                position={[o.destinationLat!, o.destinationLon!]}
                icon={ICONS[o.status as keyof typeof ICONS] as L.DivIcon ?? ICONS.searching}
              >
                <Popup maxWidth={260}><OrderDestPopup o={o} /></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && isEmpty && (
        <div className="rounded-xl border bg-card shadow-sm p-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <span className="text-4xl">🗺️</span>
          <p className="font-medium">لا يوجد مندوبون أو طلبات نشطة بموقع مسجّل</p>
          <p className="text-xs">ستظهر المواقع هنا حين يفتح المندوبون التطبيق ويشاركون موقعهم</p>
        </div>
      )}

      {/* Active orders list */}
      {activeOrders.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">الطلبات النشطة ({activeOrders.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeOrders.map((o) => (
              <div key={o.id} className="border rounded-lg px-4 py-3 text-sm bg-card shadow-sm">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="font-semibold truncate">{o.restaurantName || "طلب"}</span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </div>
                {o.customerName && (
                  <p className="text-xs text-muted-foreground">العميل: {o.customerName}</p>
                )}
                {o.courierName ? (
                  <p className="text-xs text-muted-foreground">المندوب: {o.courierName}</p>
                ) : (
                  <p className="text-xs text-indigo-500">لم يُسنَد بعد</p>
                )}
                {o.address && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{o.address}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Courier list */}
      {couriers.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-2">المندوبون ({couriers.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {couriers.map((c) => (
              <div key={c.id} className={`border rounded-lg px-4 py-3 text-sm bg-card shadow-sm ${c.isOnline ? "border-orange-200 dark:border-orange-900/40" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{c.name || "مندوب"}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isOnline ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {c.isOnline ? "متصل" : "غير متصل"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                <p className="text-xs mt-1">توصيلات اليوم: <strong>{c.todayDeliveries}</strong></p>
                {c.currentOrder && (
                  <p className="text-xs mt-1 text-orange-600">
                    {STATUS_LABELS[c.currentOrder.status] ?? c.currentOrder.status}
                    {c.currentOrder.restaurantName && ` · ${c.currentOrder.restaurantName}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
