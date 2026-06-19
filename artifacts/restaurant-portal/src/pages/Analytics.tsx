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
} from "recharts";

const DAY_LABELS: Record<string, string> = {
  "0": "أحد",
  "1": "اثنين",
  "2": "ثلاثاء",
  "3": "أربعاء",
  "4": "خميس",
  "5": "جمعة",
  "6": "سبت",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return DAY_LABELS[String(day)] ?? dateStr.slice(5);
}

function formatHour(hour: number): string {
  if (hour === 0) return "12ص";
  if (hour < 12) return `${hour}ص`;
  if (hour === 12) return "12م";
  return `${hour - 12}م`;
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
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
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
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
    return (
      <div className="text-center py-20 text-muted-foreground">
        جاري تحميل التقارير...
      </div>
    );
  }

  const analytics = data ?? {
    todayOrders: 0,
    todayRevenue: 0,
    weekOrders: 0,
    weekRevenue: 0,
    dailySeries: [],
    topItems: [],
    peakHours: [],
  };

  const hasOrders = analytics.weekOrders > 0;

  const allHours: { hour: number; count: number }[] = Array.from(
    { length: 24 },
    (_, h) => ({
      hour: h,
      count:
        analytics.peakHours.find((p) => p.hour === h)?.count ?? 0,
    }),
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="طلبات اليوم"
          value={analytics.todayOrders}
          icon="📦"
          sub="طلبات مكتملة"
        />
        <StatCard
          label="إيرادات اليوم"
          value={`${analytics.todayRevenue.toLocaleString()} ل.س`}
          icon="💰"
          sub="رسوم التوصيل"
        />
        <StatCard
          label="طلبات الأسبوع"
          value={analytics.weekOrders}
          icon="📈"
          sub="آخر 7 أيام"
        />
        <StatCard
          label="إيرادات الأسبوع"
          value={`${analytics.weekRevenue.toLocaleString()} ل.س`}
          icon="💵"
          sub="آخر 7 أيام"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">المبيعات اليومية — آخر 7 أيام</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasOrders ? (
              <EmptyState label="لا توجد طلبات مكتملة هذا الأسبوع بعد" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={analytics.dailySeries.map((d) => ({
                    ...d,
                    label: formatDate(d.date),
                  }))}
                  margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 13,
                      direction: "rtl",
                    }}
                    formatter={(value, name) => [
                      name === "orders"
                        ? `${value} طلب`
                        : `${Number(value).toLocaleString()} ل.س`,
                      name === "orders" ? "الطلبات" : "الإيراد",
                    ]}
                    labelFormatter={(label) => `يوم ${label}`}
                  />
                  <Bar
                    dataKey="orders"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">🔥 الأصناف الشهيرة</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.topItems.length === 0 ? (
              <EmptyState label="لا توجد أصناف شهيرة محددة — فعّل 'شهير' على أصناف القائمة" />
            ) : (
              <ul className="space-y-2">
                {analytics.topItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium flex-1">{item.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      شهير ⭐
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ساعات الذروة — آخر 7 أيام</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasOrders ? (
            <EmptyState label="لا توجد بيانات كافية لعرض ساعات الذروة" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={allHours.map((h) => ({
                  ...h,
                  label: formatHour(h.hour),
                }))}
                margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={25}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                    direction: "rtl",
                  }}
                  formatter={(value) => [`${value} طلب`, "عدد الطلبات"]}
                  labelFormatter={(label) => `الساعة ${label}`}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary) / 0.75)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
