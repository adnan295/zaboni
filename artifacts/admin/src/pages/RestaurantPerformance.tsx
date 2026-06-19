import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api, type RestaurantPerformance } from "@/lib/api";

type NumericSortKey = keyof Pick<
  RestaurantPerformance,
  "totalOrders" | "cancellationRate" | "avgDeliveryMinutes" | "avgRating"
>;
type SortKey = NumericSortKey | "nameAr";
type SortDir = "asc" | "desc";

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= Math.round(value) ? "text-yellow-400" : "text-gray-300"}>
          ★
        </span>
      ))}
      <span className="mr-1 text-xs text-muted-foreground">{value.toFixed(1)}</span>
    </span>
  );
}

function rowAlert(r: RestaurantPerformance): "red" | "amber" | null {
  const highCancel = r.cancellationRate >= 20;
  const lowRating = r.avgRating != null && r.avgRating < 3;
  const midCancel = r.cancellationRate >= 10 && r.cancellationRate < 20;
  const midRating = r.avgRating != null && r.avgRating >= 3 && r.avgRating < 3.5;
  if (highCancel || lowRating) return "red";
  if (midCancel || midRating) return "amber";
  return null;
}

const DAYS_OPTIONS = [
  { label: "آخر 7 أيام", value: 7 },
  { label: "آخر 30 يوم", value: 30 },
  { label: "كل الوقت", value: 0 },
];

function SortHeader({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="text-right px-4 py-3 font-medium cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1 justify-end">
        {label}
        <span className="text-xs text-muted-foreground/60">
          {active ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </span>
    </th>
  );
}

export default function RestaurantPerformancePage() {
  const [days, setDays] = useState(7);
  const [sortKey, setSortKey] = useState<SortKey>("totalOrders");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "restaurant-performance", days],
    queryFn: () => api.getRestaurantPerformance(days),
    refetchInterval: 60_000,
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nameAr" ? "asc" : "desc");
    }
  }

  const sorted = [...(data ?? [])].sort((a, b) => {
    if (sortKey === "nameAr") {
      const cmp = a.nameAr.localeCompare(b.nameAr, "ar");
      return sortDir === "asc" ? cmp : -cmp;
    }
    const av = a[sortKey as NumericSortKey] ?? -1;
    const bv = b[sortKey as NumericSortKey] ?? -1;
    return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });

  const redCount = sorted.filter((r) => rowAlert(r) === "red").length;
  const amberCount = sorted.filter((r) => rowAlert(r) === "amber").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">أداء المطاعم 📈</h1>
          <p className="text-sm text-muted-foreground mt-1">
            مؤشرات الأداء لكل مطعم — الطلبات، الإلغاء، وقت التوصيل، والتقييم
          </p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                days === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && data && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted text-muted-foreground">
            <span>🍽️</span>
            <span>{data.length} مطعم</span>
          </div>
          {redCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-red-100 text-red-700">
              <span>🔴</span>
              <span>{redCount} يحتاج تدخلاً</span>
            </div>
          )}
          {amberCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-amber-100 text-amber-700">
              <span>🟡</span>
              <span>{amberCount} يحتاج متابعة</span>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm animate-pulse">
          <div className="bg-muted/50 h-11 border-b" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
              <div className="w-8 h-8 bg-muted rounded-md flex-shrink-0" />
              <div className="flex-1 space-y-1.5 self-center">
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
              <div className="h-3 bg-muted rounded w-16 self-center" />
              <div className="h-3 bg-muted rounded w-16 self-center" />
              <div className="h-3 bg-muted rounded w-16 self-center" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-muted-foreground">لا توجد بيانات.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <SortHeader col="nameAr" label="المطعم" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="totalOrders" label="الطلبات" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="cancellationRate" label="معدل الإلغاء %" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="avgDeliveryMinutes" label="متوسط وقت التوصيل" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="avgRating" label="متوسط التقييم" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((r) => {
                  const alert = rowAlert(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/restaurants?edit=${r.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/restaurants?edit=${r.id}`)}
                      className={`cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                        alert === "red"
                          ? "bg-red-50 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/30"
                          : alert === "amber"
                          ? "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {r.image ? (
                            <img
                              src={r.image}
                              alt={r.nameAr}
                              className="w-8 h-8 rounded-md object-cover flex-shrink-0 bg-muted"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-base flex-shrink-0">
                              🍽️
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm">{r.nameAr}</p>
                            <p className="text-xs text-muted-foreground">{r.name}</p>
                          </div>
                          {alert === "red" && (
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full mr-auto">
                              ⚠️ يحتاج تدخل
                            </span>
                          )}
                          {alert === "amber" && (
                            <span className="text-xs font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full mr-auto">
                              🟡 متابعة
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold">{r.totalOrders}</span>
                        {r.totalOrders > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {r.cancelledOrders} ملغي
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.totalOrders === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              r.cancellationRate >= 20
                                ? "text-red-600"
                                : r.cancellationRate >= 10
                                ? "text-amber-600"
                                : "text-green-600"
                            }`}
                          >
                            {r.cancellationRate.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.avgDeliveryMinutes != null ? (
                          <span className="font-semibold">{r.avgDeliveryMinutes} د</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-0.5">
                          <Stars value={r.avgRating} />
                          {r.ratingCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {r.ratingCount} تقييم
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-2 space-y-1">
        <p>🔴 <strong>يحتاج تدخل:</strong> معدل إلغاء ≥ 20% أو تقييم &lt; 3.0</p>
        <p>🟡 <strong>يحتاج متابعة:</strong> معدل إلغاء 10–20% أو تقييم 3.0–3.5</p>
        <p>⏱ وقت التوصيل محسوب من لحظة إنشاء الطلب حتى التوصيل — انقر على أي صف للانتقال لصفحة المطاعم</p>
      </div>
    </div>
  );
}
