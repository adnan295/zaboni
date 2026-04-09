import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [broadcastForm, setBroadcastForm] = useState({ title: "", body: "", target: "all" as "all" | "customers" | "couriers" });

  const [targetedForm, setTargetedForm] = useState({ phone: "", title: "", body: "" });

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
      setBroadcastForm((f) => ({ ...f, title: "", body: "" }));
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const targetedMutation = useMutation({
    mutationFn: api.sendNotificationToUser,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "history"] });
      if (data.success) {
        toast({
          title: "تم الإرسال!",
          description: `وصل الإشعار إلى ${data.userName || "المستخدم"} بنجاح`,
        });
      } else {
        toast({
          title: "فشل الإرسال",
          description: "المستخدم موجود لكن تعذر الإرسال",
          variant: "destructive",
        });
      }
      setTargetedForm((f) => ({ ...f, title: "", body: "" }));
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.body.trim()) return;
    broadcastMutation.mutate(broadcastForm);
  };

  const handleTargeted = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetedForm.phone.trim() || !targetedForm.title.trim() || !targetedForm.body.trim()) return;
    targetedMutation.mutate(targetedForm);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الإشعارات</h1>
        <p className="text-sm text-muted-foreground mt-1">إرسال إشعارات فورية لمستخدم محدد أو لجميع المستخدمين</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">إشعار لمستخدم محدد</CardTitle>
            <p className="text-xs text-muted-foreground">ابحث برقم الهاتف وأرسل إشعاراً مباشراً</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTargeted} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">رقم الهاتف</Label>
                <Input
                  dir="ltr"
                  value={targetedForm.phone}
                  onChange={(e) => setTargetedForm((f) => ({ ...f, phone: e.target.value.trim() }))}
                  placeholder="+963912345678"
                  maxLength={20}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input
                  value={targetedForm.title}
                  onChange={(e) => setTargetedForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="رسالة من المرسول"
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نص الإشعار</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  value={targetedForm.body}
                  onChange={(e) => setTargetedForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="نص الرسالة..."
                  maxLength={1000}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={targetedMutation.isPending || !targetedForm.phone.trim() || !targetedForm.title.trim() || !targetedForm.body.trim()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                {targetedMutation.isPending ? "جاري الإرسال..." : "إرسال لهذا المستخدم 🎯"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">إشعار جماعي</CardTitle>
            <p className="text-xs text-muted-foreground">إرسال إشعارات لجميع المستخدمين أو مجموعة محددة</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBroadcast} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="عرض خاص اليوم!"
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نص الإشعار</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  value={broadcastForm.body}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="نص الإشعار..."
                  maxLength={1000}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الجمهور المستهدف</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={broadcastForm.target}
                  onChange={(e) => setBroadcastForm((f) => ({ ...f, target: e.target.value as "all" | "customers" | "couriers" }))}
                >
                  <option value="all">الجميع</option>
                  <option value="customers">العملاء فقط</option>
                  <option value="couriers">المندوبون فقط</option>
                </select>
              </div>
              <Button
                type="submit"
                disabled={broadcastMutation.isPending || !broadcastForm.title.trim() || !broadcastForm.body.trim()}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                {broadcastMutation.isPending ? "جاري الإرسال..." : "إرسال للجميع 🔔"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">سجل الإشعارات</h2>
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
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">النوع</th>
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
                          <TargetBadge target={n.target} />
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

function TargetBadge({ target }: { target: string }) {
  if (target === "targeted") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
        🎯 فردي
      </span>
    );
  }
  if (target === "couriers") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        المندوبون
      </span>
    );
  }
  if (target === "customers") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        العملاء
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
      الجميع
    </span>
  );
}
