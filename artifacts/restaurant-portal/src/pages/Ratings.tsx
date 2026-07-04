import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Distribution = { stars: number; count: number; pct: number }[];

type RatingsData = {
  avgStars: number;
  totalCount: number;
  distribution: Distribution;
  ratings: {
    id: string;
    restaurantStars: number;
    comment: string;
    createdAt: string;
  }[];
};

function StarRow({ stars, count, pct }: { stars: number; count: number; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-muted-foreground">{stars} ⭐</span>
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="h-2 bg-yellow-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-left text-xs text-muted-foreground">{count} ({Math.round(pct)}%)</span>
    </div>
  );
}

function StarDisplay({ stars }: { stars: number }) {
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(Math.max(0, Math.min(5, stars)))}
      {"☆".repeat(Math.max(0, 5 - Math.min(5, stars)))}
    </span>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  return `منذ ${months} شهر`;
}

export default function RatingsPage() {
  const { data, isLoading } = useQuery<RatingsData>({
    queryKey: ["portal-ratings"],
    queryFn: api.getRatings,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="text-center py-20 text-muted-foreground">جاري تحميل التقييمات...</div>;
  }

  const d = data ?? { avgStars: 0, totalCount: 0, distribution: [], ratings: [] };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-6xl font-bold text-yellow-500">{d.avgStars > 0 ? d.avgStars.toFixed(1) : "—"}</p>
                <div className="mt-1">
                  <StarDisplay stars={Math.round(d.avgStars)} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{d.totalCount} تقييم</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map(s => {
                  const row = d.distribution.find(r => r.stars === s);
                  return <StarRow key={s} stars={s} count={row?.count ?? 0} pct={row?.pct ?? 0} />;
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold text-green-500">{d.distribution.find(r => r.stars >= 4)
                  ? d.distribution.filter(r => r.stars >= 4).reduce((s, r) => s + r.count, 0)
                  : 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">تقييمات ممتازة (4-5 ⭐)</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-red-400">{d.distribution.filter(r => r.stars <= 2).reduce((s, r) => s + r.count, 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">تقييمات منخفضة (1-2 ⭐)</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{d.totalCount}</p>
                <p className="text-xs text-muted-foreground mt-1">إجمالي التقييمات</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-yellow-500">
                  {d.totalCount > 0
                    ? `${Math.round((d.distribution.filter(r => r.stars >= 4).reduce((s, r) => s + r.count, 0) / d.totalCount) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">نسبة الرضا</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ratings list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخر التقييمات</CardTitle>
        </CardHeader>
        <CardContent>
          {d.ratings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا توجد تقييمات بعد — ستظهر هنا بعد أول طلب مكتمل
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {d.ratings.map(r => (
                <li key={r.id} className="py-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <StarDisplay stars={r.restaurantStars} />
                    <span className="text-xs text-muted-foreground">{formatRelative(r.createdAt)}</span>
                  </div>
                  {r.comment ? (
                    <p className="text-sm text-foreground">{r.comment}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">بدون تعليق</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
