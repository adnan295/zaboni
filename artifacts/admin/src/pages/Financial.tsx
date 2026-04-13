import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const RANGE_OPTIONS = [
  { label: "آخر 7 أيام", value: 7 },
  { label: "آخر 14 يوم", value: 14 },
  { label: "آخر 30 يوم", value: 30 },
  { label: "آخر 90 يوم", value: 90 },
];

function SYP(n: number) {
  return `${n.toLocaleString("ar-SY")} ل.س`;
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function FinancialPage() {
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "financial", days, groupBy],
    queryFn: () => api.getFinancialReport(days, groupBy),
    refetchInterval: 30_000,
  });

  const chartData = (data?.revenueSeries ?? []).map((d) => ({
    ...d,
    label: groupBy === "week" ? `أسبوع ${d.date.slice(5)}` : d.date.slice(5),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">التقارير المالية</h1>
          <p className="text-sm text-muted-foreground mt-1">إيرادات الاشتراكات وتفاصيل الطلبات</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1 border border-border rounded-md p-0.5">
            <FilterButton active={groupBy === "day"} onClick={() => setGroupBy("day")}>يومي</FilterButton>
            <FilterButton active={groupBy === "week"} onClick={() => setGroupBy("week")}>أسبوعي</FilterButton>
          </div>
          <div className="flex gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <FilterButton key={opt.value} active={days === opt.value} onClick={() => setDays(opt.value)}>
                {opt.label}
              </FilterButton>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">جاري التحميل...</div>
      ) : (
        <>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💳</span>
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide">
                إيرادات المنصة (رسوم الاشتراك)
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-primary">
                    {SYP(data?.summary.subscriptionRevenue ?? 0)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">إيرادات الاشتراكات</div>
                </CardContent>
              </Card>
              <Card className="border-green-200">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">
                    {(data?.summary.paidSubscriptions ?? 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">اشتراكات مدفوعة</div>
                </CardContent>
              </Card>
              <Card className="border-yellow-200">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-yellow-600">
                    {(data?.summary.waivedSubscriptions ?? 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">معفاة</div>
                </CardContent>
              </Card>
              <Card className="border-red-200">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-500">
                    {(data?.summary.pendingSubscriptions ?? 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">معلّقة (غير مدفوعة)</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              إحصائيات الطلبات
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {SYP(data?.summary.totalDeliveryFees ?? 0)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">رسوم التوصيل (للمندوبين)</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{(data?.summary.deliveredOrders ?? 0).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground mt-1">طلبات موصَّلة</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{(data?.summary.totalOrders ?? 0).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground mt-1">إجمالي الطلبات</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-500">{(data?.summary.cancelledOrders ?? 0).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground mt-1">ملغاة</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                رسوم التوصيل {groupBy === "week" ? "الأسبوعية" : "اليومية"} (ل.س) — تذهب للمندوبين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 10) - 1)}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [SYP(value), "رسوم التوصيل"]}
                    labelFormatter={(l) => `${groupBy === "week" ? "أسبوع" : "تاريخ"}: ${l}`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">رسوم التوصيل حسب المطعم</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(!data?.byRestaurant || data.byRestaurant.length === 0) ? (
                <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                  لا توجد بيانات
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">المطعم</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">إجمالي الطلبات</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">موصَّلة</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">رسوم التوصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byRestaurant.map((r, i) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-3 font-medium" dir="rtl">{r.restaurantName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.totalOrders}</td>
                          <td className="px-4 py-3 text-green-600 font-semibold">{r.deliveredOrders}</td>
                          <td className="px-4 py-3 font-bold text-primary">{SYP(r.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
