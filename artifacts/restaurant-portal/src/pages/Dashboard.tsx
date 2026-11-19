import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Order } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { OrderDetailSheet } from "@/components/OrderDetailSheet";
import {
  TrendingUp,
  ShoppingBag,
  PackageCheck,
  Star,
  Search,
  Bike,
  CheckCircle2,
  Power,
  MapPin,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = ["searching", "accepted", "on_way"] as const;
type ActiveStatus = typeof ACTIVE_STATUSES[number];

const KANBAN_COLS: Record<ActiveStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  searching: { label: "يبحث عن سائق", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", Icon: Search },
  accepted:  { label: "مقبول",          color: "text-blue-700",  bg: "bg-blue-50 border-blue-200",   Icon: CheckCircle2 },
  on_way:    { label: "في الطريق",       color: "text-purple-700",bg: "bg-purple-50 border-purple-200", Icon: Bike },
};

function StatCard({
  label, value, sub, Icon, iconColor, pulse,
}: {
  label: string;
  value: string | number;
  sub?: string;
  Icon: React.ElementType;
  iconColor: string;
  pulse?: boolean;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative", iconColor)}>
            <Icon size={20} strokeWidth={2} />
            {pulse && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KanbanCard({ order, onClick }: { order: Order; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right bg-background border border-border rounded-lg p-3 hover:border-primary/40 hover:shadow-sm transition-all duration-150 space-y-2"
    >
      <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{order.orderText}</p>
      {order.address && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin size={11} className="mt-0.5 shrink-0" />
          <span className="line-clamp-1">{order.address}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        {order.totalAmount != null && (
          <span className="text-xs font-semibold text-primary">{order.totalAmount.toLocaleString()} ل.س</span>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mr-auto">
          <Clock size={10} />
          {new Date(order.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: stats, isLoading } = useQuery({ queryKey: ["portal-stats"], queryFn: api.getStats, refetchInterval: 30_000 });
  const { data: orders = [] } = useQuery({ queryKey: ["portal-orders"], queryFn: api.getOrders, refetchInterval: 15_000 });
  const { data: analytics } = useQuery({ queryKey: ["portal-analytics"], queryFn: api.getAnalytics, refetchInterval: 60_000 });

  const toggleOpen = useMutation({
    mutationFn: () => api.updateRestaurant({ isOpen: !stats?.isOpen }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-stats"] });
      qc.invalidateQueries({ queryKey: ["portal-me"] });
      toast({ title: stats?.isOpen ? "تم إغلاق المطعم" : "تم فتح المطعم" });
    },
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground text-sm">جاري التحميل...</div>;

  const activeOrders = orders.filter(o => (ACTIVE_STATUSES as readonly string[]).includes(o.status));
  const recentOrders = orders.filter(o => o.status === "delivered" || o.status === "cancelled").slice(0, 5);

  const todayRevenue = analytics?.todayRevenue;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">نظرة عامة</h2>
          <p className="text-xs text-muted-foreground mt-0.5">آخر تحديث: الآن</p>
        </div>
        <Button
          onClick={() => toggleOpen.mutate()}
          variant={stats?.isOpen ? "destructive" : "default"}
          disabled={toggleOpen.isPending}
          size="sm"
          className="gap-2 shrink-0"
        >
          <Power size={15} />
          {stats?.isOpen ? "إغلاق المطعم" : "فتح المطعم"}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard
          label="الحالة"
          value={stats?.isOpen ? "مفتوح" : "مغلق"}
          Icon={Power}
          iconColor={stats?.isOpen ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"}
          pulse={stats?.isOpen}
        />
        <StatCard
          label="إيراد اليوم"
          value={todayRevenue != null ? `${todayRevenue.toLocaleString()} ل.س` : "—"}
          sub={analytics?.todayOrders != null ? `${analytics.todayOrders} طلب مكتمل` : undefined}
          Icon={TrendingUp}
          iconColor="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          label="طلبات اليوم"
          value={stats?.todayOrders ?? 0}
          sub={`مُسلَّم: ${stats?.todayDelivered ?? 0}`}
          Icon={ShoppingBag}
          iconColor="bg-blue-100 text-blue-600"
        />
        <StatCard
          label="إجمالي الطلبات"
          value={stats?.totalOrders ?? 0}
          Icon={PackageCheck}
          iconColor="bg-indigo-100 text-indigo-600"
        />
        <StatCard
          label="التقييم"
          value={`${stats?.rating?.toFixed(1) ?? "—"} ★`}
          sub={`${stats?.menuItemCount ?? 0} صنف`}
          Icon={Star}
          iconColor="bg-yellow-100 text-yellow-600"
        />
      </div>

      {activeOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground">الطلبات النشطة الآن</h2>
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none animate-pulse">
              {activeOrders.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ACTIVE_STATUSES.map(status => {
              const col = KANBAN_COLS[status];
              const ColIcon = col.Icon;
              const colOrders = activeOrders.filter(o => o.status === status);
              return (
                <div key={status} className="space-y-2">
                  <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold", col.bg, col.color)}>
                    <ColIcon size={13} />
                    {col.label}
                    {colOrders.length > 0 && (
                      <span className="mr-auto font-bold">{colOrders.length}</span>
                    )}
                  </div>
                  {colOrders.length === 0 ? (
                    <div className="bg-muted/30 border border-dashed border-border rounded-lg py-6 text-center text-xs text-muted-foreground">
                      لا توجد طلبات
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {colOrders.map(order => (
                        <KanbanCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-3 text-foreground">آخر الطلبات المنجزة</h2>
        {recentOrders.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">لا توجد طلبات منجزة بعد</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentOrders.map(order => (
              <button
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="w-full text-right"
              >
                <Card className="border-border/60 shadow-sm hover:border-primary/30 hover:shadow-md transition-all duration-150">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-foreground">{order.orderText}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{order.address ?? "—"}</p>
                      </div>
                      <div className="text-left shrink-0 space-y-1">
                        {order.totalAmount != null && (
                          <p className="text-sm font-semibold text-foreground">{order.totalAmount.toLocaleString()} ل.س</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onOpenChange={open => { if (!open) setSelectedOrder(null); }}
      />
    </div>
  );
}
