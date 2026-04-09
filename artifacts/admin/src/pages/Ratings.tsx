import { useQuery } from "@tanstack/react-query";
import { api, type Rating } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= value ? "text-yellow-400" : "text-gray-300"}>
          ★
        </span>
      ))}
      <span className="mr-1 text-xs text-muted-foreground font-medium">{value}/5</span>
    </span>
  );
}

function RatingRow({ rating }: { rating: Rating }) {
  const date = new Date(rating.createdAt).toLocaleString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <tr className="border-b border-border hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3 text-sm">
        <div className="font-medium text-foreground">{rating.userName ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{rating.userPhone ?? ""}</div>
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="font-medium text-foreground">{rating.courierName ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{rating.courierPhone ?? ""}</div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[160px] truncate">
        {rating.restaurantName || "—"}
      </td>
      <td className="px-4 py-3">
        <Stars value={rating.restaurantStars} />
      </td>
      <td className="px-4 py-3">
        <Stars value={rating.courierStars} />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px]">
        {rating.comment || <span className="italic text-muted-foreground/50">بدون تعليق</span>}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{date}</td>
    </tr>
  );
}

export default function RatingsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "ratings"],
    queryFn: () => api.getRatings(100, 0),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">التقييمات</h1>
        <p className="text-sm text-muted-foreground mt-1">آراء العملاء في المطاعم والمندوبين</p>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{data.total}</div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي التقييمات</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-yellow-500">
                {data.avgRestaurantStars != null ? `${data.avgRestaurantStars} ★` : "—"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">متوسط تقييم المطعم</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-500">
                {data.avgCourierStars != null ? `${data.avgCourierStars} ★` : "—"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">متوسط تقييم المندوب</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">جاري التحميل...</div>
          )}
          {isError && (
            <div className="flex items-center justify-center h-40 text-destructive">فشل في تحميل التقييمات.</div>
          )}
          {data && data.ratings.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <span className="text-3xl">⭐</span>
              <span className="text-sm">لا توجد تقييمات بعد</span>
            </div>
          )}
          {data && data.ratings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">العميل</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">المندوب</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">المطعم</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">تقييم المطعم ★</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">تقييم المندوب ★</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">التعليق</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ratings.map((r) => (
                    <RatingRow key={r.id} rating={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
