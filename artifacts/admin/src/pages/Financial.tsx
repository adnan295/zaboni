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
  { label: "Last 7 days", value: 7 },
  { label: "Last 14 days", value: 14 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

function SYP(n: number) {
  return `${n.toLocaleString("ar-SY")} ل.س`;
}

export default function FinancialPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "financial", days],
    queryFn: () => api.getFinancialReport(days),
    refetchInterval: 30_000,
  });

  const chartData = (data?.dailyRevenue ?? []).map((d) => ({
    ...d,
    date: d.date.slice(5),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Delivery revenue and order breakdown</p>
        </div>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                days === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">{SYP(data?.summary.totalRevenue ?? 0)}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Revenue</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{(data?.summary.deliveredOrders ?? 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">Delivered Orders</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{(data?.summary.totalOrders ?? 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Orders</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-500">{(data?.summary.cancelledOrders ?? 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">Cancelled</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Revenue (ل.س)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
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
                    formatter={(value: number) => [SYP(value), "Revenue"]}
                    labelFormatter={(l) => `Date: ${l}`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#FF6B00" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue by Restaurant</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(!data?.byRestaurant || data.byRestaurant.length === 0) ? (
                <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                  No data
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Restaurant</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Total Orders</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Delivered</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Revenue</th>
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
