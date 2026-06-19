import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  searching: { label: "يبحث عن سائق", color: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "مقبول", color: "bg-blue-100 text-blue-700" },
  on_way: { label: "في الطريق", color: "bg-purple-100 text-purple-700" },
  delivered: { label: "تم التوصيل", color: "bg-green-100 text-green-700" },
  cancelled: { label: "ملغى", color: "bg-red-100 text-red-700" },
};

export default function Orders() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const { data: orders = [], isLoading } = useQuery({ queryKey: ["portal-orders"], queryFn: api.getOrders, refetchInterval: 15_000 });

  const filtered = orders.filter(o => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (search && !o.orderText.includes(search) && !o.address?.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <select
          className="border border-border rounded-md px-3 py-2 text-sm bg-background"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="all">كل الطلبات</option>
          <option value="searching">يبحث عن سائق</option>
          <option value="accepted">مقبول</option>
          <option value="on_way">في الطريق</option>
          <option value="delivered">تم التوصيل</option>
          <option value="cancelled">ملغى</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">لا توجد طلبات</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-700" };
            return (
              <Card key={order.id}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{order.orderText}</p>
                      {order.address && <p className="text-xs text-muted-foreground mt-1">📍 {order.address}</p>}
                      {order.courierName && <p className="text-xs text-muted-foreground mt-0.5">🛵 {order.courierName}</p>}
                    </div>
                    <div className="text-left shrink-0 space-y-1">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      {order.deliveryFee != null && (
                        <p className="text-xs text-muted-foreground">{order.deliveryFee} ل.س توصيل</p>
                      )}
                      <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("ar-SA")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
