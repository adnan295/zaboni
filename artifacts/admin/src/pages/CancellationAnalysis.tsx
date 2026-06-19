import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "@/lib/api";

const DAY_OPTIONS = [
  { value: 7, label: "آخر ٧ أيام" },
  { value: 30, label: "آخر ٣٠ يوماً" },
  { value: 90, label: "آخر ٩٠ يوماً" },
] as const;

function Card({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value.toLocaleString("ar-SY")}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function CancellationAnalysis() {
  const [days, setDays] = useState<7 | 30 | 90>(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "cancellation-stats", days],
    queryFn: () => api.getCancellationStats(days),
    staleTime: 60_000,
  });

  const hourData =
    data?.byHour.map((h) => ({
      hour: `${String(h.hour).padStart(2, "0")}:00`,
      "الإلغاءات": h.count,
    })) ?? [];

  const zoneData = data?.byZone ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">تحليل الإلغاءات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            أسباب الإلغاء وأنماطها بحسب الوقت والمنطقة والمطعم
          </p>
        </div>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value as 7 | 30 | 90)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                days === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          جارٍ التحميل…
        </div>
      )}
      {isError && (
        <div className="text-center py-16 text-destructive text-sm">
          فشل تحميل البيانات
        </div>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card
              label="إجمالي الإلغاءات"
              value={data.total}
              sub={`خلال آخر ${days} يوماً`}
              color="text-foreground"
            />
            <Card
              label="إلغاء العميل"
              value={data.byReason.customerInitiated}
              sub={
                data.total > 0
                  ? `${Math.round((data.byReason.customerInitiated / data.total) * 100)}% من الإجمالي`
                  : undefined
              }
              color="text-orange-500"
            />
            <Card
              label="انتهاء مهلة السائق"
              value={data.byReason.autoExpired}
              sub={
                data.total > 0
                  ? `${Math.round((data.byReason.autoExpired / data.total) * 100)}% من الإجمالي`
                  : undefined
              }
              color="text-red-500"
            />
          </div>

          {data.byReason.postAccept > 0 && (
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>
                <strong>{data.byReason.postAccept}</strong> إلغاء حدث بعد قبول السائق — قد يشير إلى مشاكل في المطاعم أو تأخر في التحضير.
              </span>
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* By hour */}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold mb-4">الإلغاءات حسب ساعة اليوم (توقيت دمشق)</h2>
              {hourData.every((d) => d["الإلغاءات"] === 0) ? (
                <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hourData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      interval={3}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar dataKey="الإلغاءات" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* By zone */}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold mb-4">الإلغاءات حسب نطاق التوصيل</h2>
              {zoneData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات للنطاقات</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={zoneData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <YAxis
                      dataKey="zone"
                      type="category"
                      width={90}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar dataKey="count" name="عدد الإلغاءات" fill="#f97316" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Restaurant table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold">أعلى المطاعم في نسبة الإلغاء</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                مرتبة تنازلياً — تشمل فقط المطاعم التي لديها طلبات ملغاة
              </p>
            </div>
            {data.byRestaurant.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">لا توجد بيانات</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">#</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">المطعم</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">إجمالي الطلبات</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">الملغاة</th>
                      <th className="text-right px-5 py-3 font-medium text-muted-foreground">نسبة الإلغاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRestaurant.map((r, i) => (
                      <tr key={r.restaurantName} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-5 py-3 font-medium">{r.restaurantName}</td>
                        <td className="px-5 py-3">{r.totalOrders.toLocaleString("ar-SY")}</td>
                        <td className="px-5 py-3 text-red-500 font-medium">{r.cancelled.toLocaleString("ar-SY")}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              r.rate >= 50
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : r.rate >= 25
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            }`}
                          >
                            {r.rate}٪
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
