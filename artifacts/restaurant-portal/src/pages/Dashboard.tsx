import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  searching: "🔍 يبحث عن سائق",
  accepted: "✅ مقبول",
  on_way: "🛵 في الطريق",
  delivered: "📦 تم التوصيل",
  cancelled: "❌ ملغى",
};

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <span className="text-4xl">{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery({ queryKey: ["portal-stats"], queryFn: api.getStats, refetchInterval: 30_000 });
  const { data: orders } = useQuery({ queryKey: ["portal-orders"], queryFn: api.getOrders, refetchInterval: 30_000 });

  const toggleOpen = useMutation({
    mutationFn: () => api.updateRestaurant({ isOpen: !stats?.isOpen }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-stats"] });
      qc.invalidateQueries({ queryKey: ["portal-me"] });
      toast({ title: stats?.isOpen ? "تم الإغلاق" : "تم الفتح" });
    },
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>;

  const recentOrders = orders?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">نظرة عامة</h2>
        <Button
          onClick={() => toggleOpen.mutate()}
          variant={stats?.isOpen ? "destructive" : "default"}
          disabled={toggleOpen.isPending}
        >
          {stats?.isOpen ? "🔴 إغلاق المطعم" : "🟢 فتح المطعم"}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="حالة المطعم" value={stats?.isOpen ? "مفتوح" : "مغلق"} icon={stats?.isOpen ? "🟢" : "🔴"} />
        <StatCard label="طلبات اليوم" value={stats?.todayOrders ?? 0} icon="📦" sub={`تسليم: ${stats?.todayDelivered ?? 0}`} />
        <StatCard label="إجمالي الطلبات" value={stats?.totalOrders ?? 0} icon="📊" />
        <StatCard label="التقييم" value={`${stats?.rating ?? 0} ⭐`} icon="⭐" sub={`${stats?.menuItemCount ?? 0} صنف`} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">آخر الطلبات</h2>
        {recentOrders.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد طلبات بعد</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {recentOrders.map(order => (
              <Card key={order.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{order.orderText}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{order.address ?? "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs">{STATUS_LABELS[order.status] ?? order.status}</span>
                      <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("ar-SA")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
