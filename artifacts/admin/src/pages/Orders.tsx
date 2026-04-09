import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Order, ORDER_STATUSES } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const PAGE_SIZE = 50;

function exportCSV(orders: Order[]) {
  const headers = [
    "ID",
    "Order Text",
    "Customer",
    "Customer Phone",
    "Restaurant",
    "Status",
    "Courier",
    "Courier Phone",
    "Address",
    "Payment",
    "Est. Minutes",
    "Created At",
    "Updated At",
  ];

  const rows = orders.map((o) => [
    o.id,
    `"${(o.orderText ?? "").replace(/"/g, '""')}"`,
    o.customerName ?? "",
    o.customerPhone ?? "",
    o.restaurantName ?? "",
    o.status,
    o.courierName ?? "",
    o.courierPhone ?? "",
    `"${(o.address ?? "").replace(/"/g, '""')}"`,
    o.paymentMethod,
    o.estimatedMinutes,
    new Date(o.createdAt).toISOString(),
    new Date(o.updatedAt).toISOString(),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `marsool-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Orders() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders", page],
    queryFn: () => api.getOrders(page, PAGE_SIZE),
    refetchInterval: 15_000,
  });

  const orders = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.orderText.includes(search) ||
      o.restaurantName.toLowerCase().includes(search.toLowerCase()) ||
      o.address.toLowerCase().includes(search.toLowerCase()) ||
      o.courierName.toLowerCase().includes(search.toLowerCase()) ||
      (o.customerName ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
        >
          ⬇ Export CSV ({filtered.length})
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <Input
          type="search"
          placeholder="Search orders..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
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
        <span className="text-sm text-muted-foreground">
          {total} total orders
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
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Restaurant</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Courier</th>
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

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(order.status);
  const qc = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.updateOrderStatus(order.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

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
          {order.customerName || (
            <span className="text-muted-foreground font-mono text-xs">
              {order.userId.slice(0, 8)}…
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          {order.restaurantName || (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          {order.courierName || (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm capitalize">{order.paymentMethod}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(order.createdAt).toLocaleString()}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Order Text
                </p>
                <p dir="rtl" className="text-sm">
                  {order.orderText}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Customer
                </p>
                <p>{order.customerName || "—"}</p>
                {order.customerPhone && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {order.customerPhone}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Order ID
                </p>
                <p className="font-mono text-xs">{order.id}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Courier
                </p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Address
                </p>
                <p>{order.address || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Est. Time
                </p>
                <p>{order.estimatedMinutes} min</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Updated
                </p>
                <p>{new Date(order.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            <div
              className="flex items-center gap-2 pt-3 border-t"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-muted-foreground">
                Force Status:
              </p>
              <Select
                value={pendingStatus}
                onValueChange={setPendingStatus}
                disabled={statusMutation.isPending}
              >
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={
                  statusMutation.isPending || pendingStatus === order.status
                }
                onClick={() => statusMutation.mutate(pendingStatus)}
              >
                {statusMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {statusMutation.isSuccess && (
                <span className="text-xs text-green-600">✓ Updated</span>
              )}
              {statusMutation.isError && (
                <span className="text-xs text-destructive">
                  Failed: {(statusMutation.error as Error).message}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
