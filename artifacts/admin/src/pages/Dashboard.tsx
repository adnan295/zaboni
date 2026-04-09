import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  searching: "Searching",
  accepted: "Accepted",
  picked_up: "Picked Up",
  on_way: "On the Way",
  delivered: "Delivered",
};

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  picked_up: "bg-purple-100 text-purple-800",
  on_way: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
};

const PIE_COLORS = ["#FF6B00", "#3b82f6", "#8b5cf6", "#6366f1", "#22c55e"];

function StatCard({
  label,
  value,
  icon,
  color,
  sublabel,
}: {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  sublabel?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xl">{icon}</span>
          <span className={`text-3xl font-bold ${color}`}>{value}</span>
        </div>
        <p className="text-sm font-medium text-foreground/80">{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.getStats,
    refetchInterval: 30_000,
  });

  const { data: dailyData = [] } = useQuery({
    queryKey: ["admin", "charts", "daily"],
    queryFn: api.getDailyChart,
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
        <h1 className="text-2xl font-bold">Dashboard</h1>
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
          {[...Array(2)].map((_, i) => (
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

  const statCards = [
    {
      label: "Today's Orders",
      value: stats.todayOrders,
      icon: "📅",
      color: "text-orange-500",
    },
    {
      label: "Total Orders",
      value: stats.orders,
      icon: "📦",
      color: "text-blue-500",
    },
    {
      label: "Restaurants",
      value: stats.restaurants,
      icon: "🍽️",
      color: "text-purple-500",
    },
    {
      label: "Customers",
      value: stats.users - stats.couriers,
      icon: "🛒",
      color: "text-green-500",
    },
    {
      label: "Couriers",
      value: stats.couriers,
      icon: "🚴",
      color: "text-indigo-500",
    },
    {
      label: "Menu Items",
      value: stats.menuItems,
      icon: "🍔",
      color: "text-rose-500",
    },
  ];

  const activeOrders = stats.ordersByStatus.filter(
    (s) => s.status !== "delivered",
  );
  const totalActive = activeOrders.reduce((sum, s) => sum + Number(s.count), 0);

  const pieData = stats.ordersByStatus.map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: Number(s.count),
  }));

  const hourlyFormatted = hourlyData.map((h) => ({
    hour: `${h.hour}:00`,
    orders: h.orders,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs text-muted-foreground">
          Auto-refreshes every 30s
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {totalActive > 0 && (
        <Card className="shadow-sm border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-orange-700 dark:text-orange-400">
              🔴 Live Active Orders — {totalActive}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {activeOrders.map(({ status, count }) => (
                <div
                  key={status}
                  className="flex items-center gap-1.5 bg-white dark:bg-card border rounded-lg px-3 py-1.5 shadow-sm"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status === "searching"
                        ? "bg-yellow-400"
                        : status === "accepted"
                          ? "bg-blue-400"
                          : status === "picked_up"
                            ? "bg-purple-400"
                            : "bg-indigo-400"
                    }`}
                  />
                  <span className="text-sm font-medium">
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-sm font-bold text-orange-600">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {dailyData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Orders — Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#FF6B00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(dailyData.length / 6)}
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
                  dataKey="orders"
                  stroke="#FF6B00"
                  strokeWidth={2}
                  fill="url(#orangeGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#FF6B00" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {pieData.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Orders by Status
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
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
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
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {hourlyFormatted.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Orders by Hour of Day
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
                  <Bar dataKey="orders" fill="#FF6B00" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Recent Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet.</p>
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
                      {new Date(order.createdAt).toLocaleString()}
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
