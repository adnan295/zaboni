import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", body: "", target: "all" as "all" | "customers" | "couriers" });

  const { data: history = [] } = useQuery({
    queryKey: ["admin", "notifications", "history"],
    queryFn: api.getNotificationHistory,
    refetchInterval: 15_000,
  });

  const broadcastMutation = useMutation({
    mutationFn: api.broadcastNotification,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "history"] });
      toast({
        title: "تم الإرسال!",
        description: `${data.sentCount} أُرسل، ${data.failedCount} فشل`,
      });
      setForm((f) => ({ ...f, title: "", body: "" }));
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    broadcastMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الإشعارات الجماعية</h1>
        <p className="text-sm text-muted-foreground mt-1">إرسال إشعارات فورية لجميع المستخدمين أو مجموعة محددة</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="عرض خاص اليوم!"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>نص الإشعار</Label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="نص الإشعار..."
                maxLength={1000}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>الجمهور المستهدف</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value as "all" | "customers" | "couriers" }))}
              >
                <option value="all">الجميع</option>
                <option value="customers">العملاء فقط</option>
                <option value="couriers">المندوبون فقط</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={broadcastMutation.isPending || !form.title.trim() || !form.body.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {broadcastMutation.isPending ? "جاري الإرسال..." : "إرسال الإشعار 🔔"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">الإشعارات الأخيرة</h2>
        <Card>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                <span className="text-3xl">🔔</span>
                <span className="text-sm">لم يُرسَل أي إشعار بعد</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">العنوان</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">النص</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">المستهدف</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">أُرسل</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">فشل</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((n) => (
                      <tr key={n.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium max-w-[160px] truncate">{n.title}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{n.body}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            n.target === "couriers"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : n.target === "customers"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                          }`}>
                            {n.target === "all" ? "الجميع" : n.target === "customers" ? "العملاء" : "المندوبون"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-green-600 font-semibold">{n.sentCount}</td>
                        <td className="px-4 py-3 text-red-500 font-semibold">{n.failedCount}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(n.createdAt).toLocaleString("ar-SY", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
