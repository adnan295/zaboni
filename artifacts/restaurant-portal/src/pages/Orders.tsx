import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Order } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderDetailSheet } from "@/components/OrderDetailSheet";
import { MapPin, Bike, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  searching: { label: "يبحث عن سائق", color: "bg-amber-100 text-amber-700 border-amber-200" },
  accepted:  { label: "مقبول",         color: "bg-blue-100 text-blue-700 border-blue-200" },
  on_way:    { label: "في الطريق",      color: "bg-purple-100 text-purple-700 border-purple-200" },
  delivered: { label: "تم التوصيل",     color: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "ملغى",           color: "bg-red-100 text-red-600 border-red-200" },
};

const ACTIVE = ["searching", "accepted", "on_way"];

export default function Orders() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["portal-orders"],
    queryFn: api.getOrders,
    refetchInterval: 15_000,
  });

  const filtered = orders.filter(o => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (search && !o.orderText.includes(search) && !o.address?.includes(search)) return false;
    return true;
  });

  const activeCount = orders.filter(o => ACTIVE.includes(o.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative max-w-xs w-full">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث بنص الطلب أو العنوان..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">
              كل الطلبات
              {activeCount > 0 && <span className="mr-1.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{activeCount} نشط</span>}
            </SelectItem>
            <SelectItem value="searching">يبحث عن سائق</SelectItem>
            <SelectItem value="accepted">مقبول</SelectItem>
            <SelectItem value="on_way">في الطريق</SelectItem>
            <SelectItem value="delivered">تم التوصيل</SelectItem>
            <SelectItem value="cancelled">ملغى</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:mr-auto">{filtered.length} طلب</span>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">لا توجد طلبات</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
            const isActive = ACTIVE.includes(order.status);
            return (
              <button
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="w-full text-right"
              >
                <Card className={cn(
                  "border-border/60 shadow-sm hover:border-primary/30 hover:shadow-md transition-all duration-150",
                  isActive && "border-amber-200/80 bg-amber-50/30"
                )}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="font-medium text-sm text-foreground line-clamp-2 leading-snug">{order.orderText}</p>
                        {order.address && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin size={11} className="mt-0.5 shrink-0" />
                            <span className="line-clamp-1">{order.address}</span>
                          </div>
                        )}
                        {order.courierName && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Bike size={11} className="shrink-0" />
                            {order.courierName}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium border", statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                        {order.totalAmount != null && (
                          <p className="text-sm font-bold text-foreground">{order.totalAmount.toLocaleString()} ل.س</p>
                        )}
                        {order.deliveryFee != null && (
                          <p className="text-xs text-muted-foreground">{order.deliveryFee.toLocaleString()} ل.س توصيل</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onOpenChange={open => { if (!open) setSelectedOrder(null); }}
      />
    </div>
  );
}
