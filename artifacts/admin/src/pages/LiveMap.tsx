import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CourierLocation } from "@/lib/api";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default marker icon paths (Vite bundles differently)
delete (L.Icon.Default.prototype as Record<string, unknown>)["_getIconUrl"];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Orange courier icon
const courierIcon = L.divIcon({
  className: "",
  html: `<div style="width:36px;height:36px;background:#FF6B00;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.35)">🛵</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
});

const offlineCourierIcon = L.divIcon({
  className: "",
  html: `<div style="width:32px;height:32px;background:#9ca3af;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.25)">🛵</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

const STATUS_LABELS: Record<string, string> = {
  searching: "يبحث عن مندوب",
  accepted: "قبِل المندوب",
  picked_up: "جارٍ التوصيل",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

// Damascus, Syria center
const DAMASCUS: [number, number] = [33.5138, 36.2765];

function AutoRefreshMarkers({ couriers }: { couriers: CourierLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (couriers.length > 0) {
      const bounds = couriers.map((c): [number, number] => [c.lat, c.lon]);
      if (bounds.length === 1) {
        map.setView(bounds[0], map.getZoom());
      } else {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      }
    }
  }, []);
  return null;
}

function CourierPopup({ c }: { c: CourierLocation }) {
  return (
    <div className="text-sm" dir="rtl" style={{ minWidth: 200 }}>
      <p className="font-bold text-base mb-1">{c.name || "مندوب"}</p>
      <p className="text-xs text-gray-500 mb-1 font-mono">{c.phone}</p>
      <p className="mb-1">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${c.isOnline ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {c.isOnline ? "متصل" : "غير متصل"}
        </span>
      </p>
      <p className="text-xs">توصيلات اليوم: <strong>{c.todayDeliveries}</strong></p>
      {c.locationUpdatedAt && (
        <p className="text-xs text-gray-400 mt-1">
          آخر تحديث: {new Date(c.locationUpdatedAt).toLocaleTimeString("ar-SY")}
        </p>
      )}
      {c.currentOrder && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs font-semibold text-orange-600 mb-1">الطلب الحالي:</p>
          <p className="text-xs">
            <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700`}>
              {STATUS_LABELS[c.currentOrder.status] ?? c.currentOrder.status}
            </span>
          </p>
          {c.currentOrder.restaurantName && (
            <p className="text-xs mt-0.5">من: <strong>{c.currentOrder.restaurantName}</strong></p>
          )}
          {c.currentOrder.customerName && (
            <p className="text-xs">للعميل: <strong>{c.currentOrder.customerName}</strong></p>
          )}
          {c.currentOrder.address && (
            <p className="text-xs text-gray-500 truncate" style={{ maxWidth: 200 }}>{c.currentOrder.address}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveMap() {
  const { data: couriers = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "couriers", "locations"],
    queryFn: api.getCourierLocations,
    refetchInterval: 15_000,
  });

  const onlineCouriers = couriers.filter((c) => c.isOnline);
  const offlineCouriers = couriers.filter((c) => !c.isOnline);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">الخريطة الحية</h1>
          <p className="text-sm text-muted-foreground mt-0.5">مواقع المندوبين في الوقت الفعلي · تتحدث كل 15 ثانية</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
            متصل ({onlineCouriers.length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
            غير متصل ({offlineCouriers.length})
          </span>
          {dataUpdatedAt > 0 && (
            <span className="text-muted-foreground text-xs">
              آخر تحديث: {new Date(dataUpdatedAt).toLocaleTimeString("ar-SY")}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="border rounded-xl bg-card shadow-sm h-[540px] flex items-center justify-center">
          <p className="text-muted-foreground">جاري تحميل الخريطة...</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm" style={{ height: 540 }}>
          <MapContainer
            center={couriers.length > 0 ? [couriers[0].lat, couriers[0].lon] : DAMASCUS}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {couriers.length > 0 && <AutoRefreshMarkers couriers={couriers} />}
            {couriers.map((c) => (
              <Marker
                key={c.id}
                position={[c.lat, c.lon]}
                icon={c.isOnline ? courierIcon : offlineCourierIcon}
              >
                <Popup maxWidth={240}>
                  <CourierPopup c={c} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {!isLoading && couriers.length === 0 && (
        <div className="rounded-xl border bg-card shadow-sm p-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <span className="text-4xl">🗺️</span>
          <p className="font-medium">لا يوجد مندوبون نشطون بموقع مسجّل</p>
          <p className="text-xs">ستظهر المواقع هنا حين يفتح المندوبون التطبيق ويشاركون موقعهم</p>
        </div>
      )}

      {couriers.length > 0 && (
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
      )}
    </div>
  );
}
