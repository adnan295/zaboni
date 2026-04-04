import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Order } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export default function Orders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: api.getOrders,
    refetchInterval: 15_000,
  });

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.orderText.includes(search) ||
      o.restaurantName.toLowerCase().includes(search.toLowerCase()) ||
      o.address.toLowerCase().includes(search.toLowerCase()) ||
      o.courierName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>

      <div className="flex gap-3 flex-wrap">
        <Input
          type="search"
          placeholder="Search orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">
          {filtered.length} orders
        </span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No orders found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Order</th>
                <th className="text-left px-4 py-3 font-medium">Restaurant</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Courier</th>
                <th className="text-left px-4 py-3 font-medium">Address</th>
                <th className="text-left px-4 py-3 font-medium">Payment</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3">
          <p className="font-mono text-xs text-muted-foreground mb-1">
            #{order.id.slice(-8)}
          </p>
          <p className="text-sm line-clamp-1" dir="rtl">
            {order.orderText}
          </p>
        </td>
        <td className="px-4 py-3 text-sm">
          {order.restaurantName || <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          {order.courierName || <span className="text-muted-foreground">Unassigned</span>}
        </td>
        <td className="px-4 py-3 text-sm max-w-[180px]">
          <p className="truncate">{order.address || "—"}</p>
        </td>
        <td className="px-4 py-3 text-sm capitalize">{order.paymentMethod}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(order.createdAt).toLocaleString()}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Order Text</p>
                <p dir="rtl" className="text-sm">
                  {order.orderText}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">User ID</p>
                <p className="font-mono text-xs">{order.userId}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Order ID</p>
                <p className="font-mono text-xs">{order.id}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Courier</p>
                <p>
                  {order.courierName || "—"}{" "}
                  {order.courierPhone && (
                    <span className="text-muted-foreground text-xs">
                      ({order.courierPhone})
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Est. Time</p>
                <p>{order.estimatedMinutes} min</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Updated</p>
                <p>{new Date(order.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
