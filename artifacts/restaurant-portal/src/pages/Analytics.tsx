import { useQuery } from "@tanstack/react-query";
import { api, type Analytics } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const DAY_SHORT: Record<number, string> = {
  0: "أحد", 1: "اثنين", 2: "ثلاثاء", 3: "أربعاء",
  4: "خميس", 5: "جمعة", 6: "سبت",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y!, m! - 1, d!).getDay();
  return DAY_SHORT[day] ?? dateStr.slice(5);
}

function formatHour(hour: number): string {
  if (hour === 0) return "12ص";
  if (hour < 12) return `${hour}ص`;
  if (hour === 12) return "12م";
  return `${hour - 12}م`;
}

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 13,
  direction: "rtl" as const,
};

function StatCard({ label, value, sub, icon }: {
  label: string; value: string | number; sub?: string; icon: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <span className="text-4xl">{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-36 text-muted-foreground text-sm text-center px-4">
      {label}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["portal-analytics"],
    queryFn: api.getAnalytics,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="text-center py-20 text-muted-foreground">جاري تحميل التقارير...</div>;
  }

  const a = data ?? {
    todayOrders: 0, todayRevenue: 0,
    weekOrders: 0, weekRevenue: 0,
    dailySeries: [], topItems: [], peakHours: [],
  };

  const hasWeekData = a.weekOrders > 0;

  const allHours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: formatHour(h),
    count: a.peakHours.find(p => p.hour === h)?.count ?? 0,
  }));

  const dailyData = a.dailySeries.map(d => ({
    ...d,
    label: formatDate(d.date),
  }));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="طلبات اليوم" value={a.todayOrders} icon="📦" sub="طلبات مكتملة" />
        <StatCard
          label="إيرادات التوصيل اليوم"
          value={a.todayRevenue > 0 ? `${a.todayRevenue.toLocaleString()} ل.س` : "—"}
          icon="💰"
          sub="رسوم التوصيل"
        />
        <StatCard label="طلبات الأسبوع" value={a.weekOrders} icon="📈" sub="آخر 7 أيام" />
        <StatCard
          label="إيرادات التوصيل أسبوعياً"
          value={a.weekRevenue > 0 ? `${a.weekRevenue.toLocaleString()} ل.س` : "—"}
          icon="💵"
          sub="آخر 7 أيام"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المبيعات اليومية — آخر 7 أيام</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasWeekData ? (
            <EmptyState label="لا توجد طلبات مكتملة هذا الأسبوع بعد" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyData} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} width={28}
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="left"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false} tickLine={false} width={52}
                  tickFormatter={v => v > 0 ? `${(v / 1000).toFixed(0)}k` : "0"}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [
                    name === "orders"
                      ? `${value} طلب`
                      : `${Number(value).toLocaleString()} ل.س`,
                    name === "orders" ? "الطلبات" : "إيراد التوصيل",
                  ]}
                  labelFormatter={label => `يوم ${label}`}
                />
                <Legend
                  formatter={name => name === "orders" ? "الطلبات" : "إيراد التوصيل"}
                  wrapperStyle={{ fontSize: 12, direction: "rtl" }}
                />
                <Bar yAxisId="orders" dataKey="orders" name="orders"
                  fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar yAxisId="revenue" dataKey="revenue" name="revenue"
                  fill="hsl(var(--primary) / 0.35)" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">🔥 أكثر الأصناف طلباً</CardTitle>
          </CardHeader>
          <CardContent>
            {a.topItems.length === 0 ? (
              <EmptyState label="لا توجد بيانات كافية — ستظهر الأصناف هنا بعد اكتمال الطلبات" />
            ) : (
              <ul className="space-y-2">
                {a.topItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className="text-lg font-bold text-muted-foreground w-6 shrink-0">{i + 1}</span>
                    <span className="text-sm font-medium flex-1">{item.name}</span>
                    <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {item.count} طلب
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">⏰ ساعات الذروة — آخر 7 أيام</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasWeekData ? (
              <EmptyState label="لا توجد بيانات كافية لعرض ساعات الذروة" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={allHours} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false} tickLine={false} interval={1}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false} tickLine={false} width={22}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={v => [`${v} طلب`, "عدد الطلبات"]}
                    labelFormatter={label => `الساعة ${label}`}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary) / 0.7)"
                    radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
