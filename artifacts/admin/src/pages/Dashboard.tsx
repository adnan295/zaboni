import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Order, type WaVerifyHealth } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const STATUS_LABELS: Record<string, string> = {
  searching: "يبحث عن مندوب",
  accepted: "قبِل المندوب",
  picked_up: "جارٍ التوصيل",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
};

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  picked_up: "bg-purple-100 text-purple-800",
  on_way: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
};

const PIE_COLORS = ["#DC2626", "#3b82f6", "#8b5cf6", "#6366f1", "#22c55e"];

function WaVerifyHealthCard({ health, isLoading, isFetching, refetch, lastUpdated }: {
  health: WaVerifyHealth | undefined;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
  lastUpdated: Date | null;
}) {
  const connected = health?.ok === true;
  const notConfigured = health?.configured === false;

  return (
    <Card className={`shadow-sm border ${
      isLoading
        ? "border-border"
        : connected
          ? "border-green-200 dark:border-green-900/40 bg-green-50/40 dark:bg-green-950/20"
          : "border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20"
    }`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <div>
              <p className="text-sm font-medium text-foreground/80">WaVerify (OTP)</p>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  آخر تحديث: {lastUpdated.toLocaleTimeString("ar-SA")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <span className="text-sm text-muted-foreground">جارٍ التحقق…</span>
            ) : (
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${connected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                <span className="relative flex h-2.5 w-2.5">
                  {connected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connected ? "bg-green-500" : "bg-red-500"}`} />
                </span>
                {notConfigured ? "غير مُهيَّأ" : connected ? "متصل" : "غير متصل"}
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 border rounded px-2 py-0.5"
              title="تحديث يدوي"
            >
              {isFetching ? "⟳" : "تحديث"}
            </button>
          </div>
        </div>
        {!isLoading && health?.message && (
          <p className="mt-2 text-xs text-muted-foreground">{health.message}</p>
        )}
        {!isLoading && health?.error && (
          <p className="mt-2 text-xs text-red-500">{health.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

type Range = 7 | 14 | 30;

function TrendBadge({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0 && today === 0) return null;
  if (yesterday === 0) {
    return (
      <span className="text-xs text-green-600 font-medium mr-1">+{today} ↑</span>
    );
  }
  const diff = today - yesterday;
  const pct = Math.round(Math.abs(diff / yesterday) * 100);
  if (diff === 0) {
    return <span className="text-xs text-muted-foreground mr-1">= نفس أمس</span>;
  }
  return (
    <span
      className={`text-xs font-medium mr-1 ${diff > 0 ? "text-green-600" : "text-red-500"}`}
    >
      {diff > 0 ? `+${diff}` : diff} ({pct}%) {diff > 0 ? "↑" : "↓"} مقارنة بالأمس
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  trend,
}: {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  trend?: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xl">{icon}</span>
          <span className={`text-3xl font-bold ${color}`}>{value}</span>
        </div>
        <p className="text-sm font-medium text-foreground/80">{label}</p>
        {trend && <div className="mt-0.5">{trend}</div>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>(30);
  const [waVerifyLastUpdated, setWaVerifyLastUpdated] = useState<Date | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.getStats,
    refetchInterval: 10_000,
  });

  const {
    data: waVerifyHealth,
    isLoading: waVerifyLoading,
    isFetching: waVerifyFetching,
    refetch: refetchWaVerify,
  } = useQuery({
    queryKey: ["admin", "waverify-health"],
    queryFn: async () => {
      const result = await api.getWaVerifyHealth();
      setWaVerifyLastUpdated(new Date());
      return result;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ["admin", "orders", "active"],
    queryFn: api.getActiveOrders,
    refetchInterval: 10_000,
  });

  const { data: dailyData = [] } = useQuery({
    queryKey: ["admin", "charts", "daily", range],
    queryFn: () => api.getDailyChart(range),
    refetchInterval: 60_000,
  });

  const { data: hourlyData = [] } = useQuery({
    queryKey: ["admin", "charts", "hourly"],
    queryFn: api.getHourlyChart,
    refetchInterval: 60_000,
  });

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5">
                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse h-64">
              <CardContent className="p-5">
                <div className="h-4 bg-muted rounded w-1/3 mb-4" />
                <div className="h-40 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const todayOrders = stats.todayOrders;
  const yesterdayOrders = stats.yesterdayOrders;

  const statCards = [
    {
      label: "طلبات اليوم",
      value: todayOrders,
      icon: "📅",
      color: "text-orange-500",
      trend: <TrendBadge today={todayOrders} yesterday={yesterdayOrders} />,
    },
    {
      label: "إجمالي الطلبات",
      value: stats.orders,
      icon: "📦",
      color: "text-blue-500",
    },
    {
      label: "المطاعم",
      value: stats.restaurants,
      icon: "🍽️",
      color: "text-purple-500",
    },
    {
      label: "العملاء",
      value: stats.users - stats.couriers,
      icon: "🛒",
      color: "text-green-500",
    },
    {
      label: "المندوبون",
      value: stats.couriers,
      icon: "🚴",
      color: "text-indigo-500",
    },
    {
      label: "عناصر القائمة",
      value: stats.menuItems,
      icon: "🍔",
      color: "text-rose-500",
    },
  ];

  const totalActive = activeOrders.length;

  const pieData = stats.ordersByStatus.map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: Number(s.count),
  }));

  const chartData = dailyData.map((d) => ({
    date: d.date.slice(5),
    count: Number(d.count),
  }));

  const hourlyFormatted = hourlyData.map((h) => ({
    hour: `${h.hour}:00`,
    count: Number(h.count),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <span className="text-xs text-muted-foreground">
          مباشر · يتحدث كل 10 ثوانٍ
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <WaVerifyHealthCard
        health={waVerifyHealth}
        isLoading={waVerifyLoading}
        isFetching={waVerifyFetching}
        refetch={refetchWaVerify}
        lastUpdated={waVerifyLastUpdated}
      />

      {totalActive > 0 && (
        <Card className="shadow-sm border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
              الطلبات النشطة الآن — {totalActive}
              <span className="text-xs font-normal text-orange-600/60">مباشر · 10 ثوانٍ</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-3 bg-white dark:bg-card border rounded-lg px-3 py-2 shadow-sm text-sm"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      order.status === "searching"
                        ? "bg-yellow-400"
                        : order.status === "accepted"
                          ? "bg-blue-400"
                          : order.status === "picked_up"
                            ? "bg-purple-400"
                            : "bg-indigo-400"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                  <span className="truncate flex-1" dir="rtl">
                    {order.orderText}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {order.customerName || order.userId.slice(0, 6)}
                  </span>
                  {order.restaurantName && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      · {order.restaurantName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              اتجاه الطلبات
            </CardTitle>
            <div className="flex gap-1">
              {([7, 14, 30] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    range === r
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r} يوم
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              لا توجد بيانات لهذه الفترة
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 6))}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="الطلبات"
                  stroke="#DC2626"
                  strokeWidth={2}
                  fill="url(#orangeGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#DC2626" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pieData.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                الطلبات حسب الحالة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {hourlyFormatted.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                ساعات الذروة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyFormatted} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" name="الطلبات" fill="#DC2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">أحدث الطلبات</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">لا توجد طلبات بعد.</p>
          ) : (
            <div className="space-y-3">
              {stats.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" dir="rtl">
                      {order.orderText}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.customerName || order.userId.slice(0, 8)} ·{" "}
                      {order.restaurantName || "—"} ·{" "}
                      {new Date(order.createdAt).toLocaleString("ar-SY")}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
