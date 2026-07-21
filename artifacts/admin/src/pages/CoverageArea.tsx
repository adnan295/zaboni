import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// Homs city center.
const HOMS_CENTER: [number, number] = [34.7324, 36.7137];

type LatLng = [number, number];

function DrawLayer({ points, onAdd }: { points: LatLng[]; onAdd: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return (
    <>
      {points.length >= 2 && (
        <Polyline positions={points} pathOptions={{ color: "#f97316", weight: 2 }} />
      )}
      {points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.25 }}
        />
      )}
      {points.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={5}
          pathOptions={{ color: "#ea580c", fillColor: "#fff", fillOpacity: 1, weight: 2 }}
        />
      ))}
    </>
  );
}

export default function CoverageAreaPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [points, setPoints] = useState<LatLng[]>([]);
  const [name, setName] = useState("");

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ["admin", "coverage-areas"],
    queryFn: api.getCoverageAreas,
  });

  const createMut = useMutation({
    mutationFn: () => api.createCoverageArea({ name: name.trim(), points }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "coverage-areas"] });
      setPoints([]);
      setName("");
      toast({ title: "تم الحفظ", description: "تم حفظ منطقة التغطية بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteCoverageArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "coverage-areas"] });
      toast({ title: "تم الحذف" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateCoverageArea(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coverage-areas"] }),
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function handleSave() {
    if (points.length < 3) {
      toast({ title: "خطأ", description: "ارسم 3 نقاط على الأقل لإغلاق المنطقة", variant: "destructive" });
      return;
    }
    createMut.mutate();
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">منطقة التغطية</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          اضغط على الخريطة نقطة نقطة لرسم حدود منطقة التوصيل. أي زبون يختار موقعاً خارج المناطق المفعّلة لن يتمكن من إرسال الطلب.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="اسم المنطقة (اختياري)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={handleSave} disabled={createMut.isPending || points.length < 3}>
          حفظ المنطقة ({points.length} نقطة)
        </Button>
        <Button variant="outline" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={points.length === 0}>
          تراجع نقطة
        </Button>
        <Button variant="outline" onClick={() => setPoints([])} disabled={points.length === 0}>
          مسح الرسم
        </Button>
      </div>

      <div className="border rounded-xl overflow-hidden shadow-sm" style={{ height: 540 }}>
        <MapContainer center={HOMS_CENTER} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Existing saved areas: green when active, gray when disabled */}
          {areas
            .filter((a) => a.points.length >= 3)
            .map((a) => (
              <Polygon
                key={a.id}
                positions={a.points}
                pathOptions={{
                  color: a.isActive ? "#16a34a" : "#9ca3af",
                  fillColor: a.isActive ? "#16a34a" : "#9ca3af",
                  fillOpacity: 0.12,
                  weight: 2,
                }}
              />
            ))}
          {/* Current drawing */}
          <DrawLayer points={points} onAdd={(p) => setPoints((prev) => [...prev, p])} />
        </MapContainer>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-2">المناطق المحفوظة ({areas.length})</h2>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">جاري التحميل...</p>
        ) : areas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            لا توجد مناطق محفوظة. ارسم منطقة على الخريطة فوق واضغط "حفظ المنطقة".
          </p>
        ) : (
          <div className="space-y-2">
            {areas.map((a) => (
              <div key={a.id} className="flex items-center justify-between border rounded-lg px-4 py-2 bg-card shadow-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: a.isActive ? "#16a34a" : "#9ca3af" }}
                  />
                  <span className="font-medium">{a.name || "منطقة بدون اسم"}</span>
                  <span className="text-xs text-muted-foreground">{a.points.length} نقطة</span>
                  {!a.isActive && <span className="text-xs text-amber-600">(معطّلة)</span>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMut.mutate({ id: a.id, isActive: !a.isActive })}
                  >
                    {a.isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate(a.id)}>
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
