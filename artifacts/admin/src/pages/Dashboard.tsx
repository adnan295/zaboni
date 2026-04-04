import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

export default function Dashboard() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: api.getStats,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-destructive text-sm">
          Failed to load stats: {(error as Error).message}
        </p>
      </div>
    );
  }

  const statCards = [
    {
      label: "Today's Orders",
      value: stats!.todayOrders,
      icon: "📅",
      color: "text-orange-500",
    },
    {
      label: "Total Orders",
      value: stats!.orders,
      icon: "📦",
      color: "text-blue-500",
    },
    {
      label: "Restaurants",
      value: stats!.restaurants,
      icon: "🍽️",
      color: "text-purple-500",
    },
    {
      label: "Customers",
      value: stats!.users - stats!.couriers,
      icon: "🛒",
      color: "text-green-500",
    },
    {
      label: "Couriers",
      value: stats!.couriers,
      icon: "🚴",
      color: "text-indigo-500",
    },
    {
      label: "Menu Items",
      value: stats!.menuItems,
      icon: "🍔",
      color: "text-rose-500",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{s.icon}</span>
                <span className={`text-3xl font-bold ${s.color}`}>
                  {s.value}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {s.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Orders by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats!.ordersByStatus.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {stats!.ordersByStatus.map(({ status, count }) => (
                  <div key={status} className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </span>
                    <span className="font-bold text-sm">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Recent Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats!.recentOrders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {stats!.recentOrders.map((order) => (
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
    </div>
  );
}
