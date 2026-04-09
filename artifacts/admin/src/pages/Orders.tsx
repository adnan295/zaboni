import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Order, ORDER_STATUSES } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  searching: "يبحث عن مندوب",
  accepted: "قبِل المندوب",
  picked_up: "جارٍ التوصيل",
  on_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

const STATUS_COLORS: Record<string, string> = {
  searching: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  picked_up: "bg-purple-100 text-purple-800",
  on_way: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

const PAGE_SIZE = 50;

function exportCSV(orders: Order[]) {
  const headers = [
    "المعرف",
    "نص الطلب",
    "العميل",
    "هاتف العميل",
    "المطعم",
    "الحالة",
    "المندوب",
    "هاتف المندوب",
    "العنوان",
    "الدفع",
    "الوقت المقدر (دقيقة)",
    "تاريخ الإنشاء",
    "تاريخ التحديث",
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const apiDateFrom = dateFrom || undefined;
  const apiDateTo = dateTo || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders", page, apiDateFrom, apiDateTo],
    queryFn: () => api.getOrders(page, PAGE_SIZE, apiDateFrom, apiDateTo),
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

  const hasActiveFilters = search || statusFilter !== "all" || dateFrom || dateTo;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الطلبات</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
        >
          ⬇ تصدير CSV ({filtered.length})
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">بحث</Label>
          <Input
            type="search"
            placeholder="ابحث في الطلبات..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">الحالة</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">من تاريخ</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="self-end text-muted-foreground hover:text-foreground"
          >
            ✕ إعادة ضبط
          </Button>
        )}

        <span className="text-sm text-muted-foreground self-end pb-1">
          {total} طلب إجمالاً
        </span>
      </div>

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm animate-pulse">
          <div className="bg-muted/50 h-11 border-b" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
              <div className="h-3 bg-muted rounded w-16 self-center" />
              <div className="h-3 bg-muted rounded w-20 self-center" />
              <div className="h-5 bg-muted rounded-full w-20 self-center" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">لا توجد طلبات.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-right px-4 py-3 font-medium">الطلب</th>
                <th className="text-right px-4 py-3 font-medium">العميل</th>
                <th className="text-right px-4 py-3 font-medium">المطعم</th>
                <th className="text-right px-4 py-3 font-medium">الحالة</th>
                <th className="text-right px-4 py-3 font-medium">المندوب</th>
                <th className="text-right px-4 py-3 font-medium">الدفع</th>
                <th className="text-right px-4 py-3 font-medium">التاريخ</th>
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
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة {page} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            التالي
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
            <span className="text-muted-foreground">غير معين</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm capitalize">{order.paymentMethod}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(order.createdAt).toLocaleString("ar-SY")}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  نص الطلب
                </p>
                <p dir="rtl" className="text-sm">
                  {order.orderText}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  العميل
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
                  معرف الطلب
                </p>
                <p className="font-mono text-xs">{order.id}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  المندوب
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
                  العنوان
                </p>
                <p>{order.address || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  الوقت المقدر
                </p>
                <p>{order.estimatedMinutes} دقيقة</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  آخر تحديث
                </p>
                <p>{new Date(order.updatedAt).toLocaleString("ar-SY")}</p>
              </div>
            </div>

            <div
              className="flex items-center gap-2 pt-3 border-t"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-muted-foreground">
                تغيير الحالة:
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
                {statusMutation.isPending ? "جاري الحفظ…" : "حفظ"}
              </Button>
              {statusMutation.isSuccess && (
                <span className="text-xs text-green-600">✓ تم التحديث</span>
              )}
              {statusMutation.isError && (
                <span className="text-xs text-destructive">
                  فشل: {(statusMutation.error as Error).message}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
