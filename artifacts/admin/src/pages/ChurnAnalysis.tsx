import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, type ChurnUser, type PromoCode } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "لم يطلب أبداً";
  return new Date(dateStr).toLocaleDateString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return `منذ ${diff} يوم`;
}

export default function ChurnAnalysisPage() {
  const { toast } = useToast();
  const [inputDays, setInputDays] = useState("7");
  const [debouncedDays, setDebouncedDays] = useState(7);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", promoCode: "" });

  useEffect(() => {
    const v = parseInt(inputDays);
    if (isNaN(v) || v < 1 || v > 365) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedDays(v);
      setSelected(new Set());
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputDays]);

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["admin", "churn", debouncedDays],
    queryFn: () => api.getChurnUsers(debouncedDays),
  });

  const { data: promos = [] } = useQuery({
    queryKey: ["admin", "promos"],
    queryFn: api.getPromos,
  });

  const activePromos = (promos as PromoCode[]).filter((p: PromoCode) => p.isActive);

  const sendMutation = useMutation({
    mutationFn: () =>
      api.sendBulkNotification({
        userIds: [...selected],
        title: form.title,
        body: form.body,
        promoCode: form.promoCode || undefined,
      }),
    onSuccess: (data) => {
      toast({
        title: "تم الإرسال!",
        description: `${data.sentCount} أُرسل، ${data.failedCount} فشل`,
      });
      setShowDialog(false);
      setSelected(new Set());
      setForm({ title: "", body: "", promoCode: "" });
      refetch();
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  function toggleAll() {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const withToken = users.filter((u) => u.hasPushToken).length;
  const selectedWithToken = users.filter((u) => selected.has(u.id) && u.hasPushToken).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">العملاء الغائبون 💤</h1>
        <p className="text-sm text-muted-foreground mt-1">
          عملاء لم يطلبوا منذ فترة — أرسل لهم إشعاراً لإعادة تفعيلهم
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">غائبون منذ أكثر من</Label>
          <Input
            type="number"
            min={1}
            max={365}
            value={inputDays}
            onChange={(e) => setInputDays(e.target.value)}
            className="w-20 text-center"
          />
          <Label className="text-sm">يوم</Label>
        </div>

        {!isLoading && (
          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-full text-sm bg-muted text-muted-foreground">
              👤 {users.length} عميل غائب
            </span>
            {withToken > 0 && (
              <span className="px-3 py-1.5 rounded-full text-sm bg-blue-100 text-blue-700">
                🔔 {withToken} لديهم إشعارات
              </span>
            )}
          </div>
        )}

        {selected.size > 0 && (
          <Button
            className="mr-auto bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowDialog(true)}
          >
            إرسال إشعار للمختارين ({selected.size}) 📨
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm animate-pulse">
          <div className="bg-muted/50 h-11 border-b" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-0">
              <div className="w-4 h-4 bg-muted rounded self-center" />
              <div className="flex-1 space-y-1.5 self-center">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-2.5 bg-muted rounded w-1/6" />
              </div>
              <div className="h-3 bg-muted rounded w-24 self-center" />
              <div className="h-3 bg-muted rounded w-16 self-center" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="border rounded-lg bg-card shadow-sm flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <span className="text-4xl">🎉</span>
          <p className="font-medium">لا يوجد عملاء غائبون منذ أكثر من {debouncedDays} يوم</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-right">
                    <input
                      type="checkbox"
                      checked={selected.size === users.length && users.length > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.size > 0 && selected.size < users.length;
                      }}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-primary cursor-pointer"
                      aria-label="تحديد الكل"
                    />
                  </th>
                  <th className="text-right px-4 py-3 font-medium">العميل</th>
                  <th className="text-right px-4 py-3 font-medium">رقم الهاتف</th>
                  <th className="text-right px-4 py-3 font-medium">آخر طلب</th>
                  <th className="text-right px-4 py-3 font-medium">إجمالي الطلبات</th>
                  <th className="text-right px-4 py-3 font-medium">الإشعارات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u: ChurnUser) => (
                  <tr
                    key={u.id}
                    onClick={() => toggleRow(u.id)}
                    className={`cursor-pointer transition-colors ${
                      selected.has(u.id) ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleRow(u.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {u.name ? u.name.charAt(0) : "?"}
                        </div>
                        <span className="font-medium">
                          {u.name || <span className="text-muted-foreground italic text-xs">بدون اسم</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.phone}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm">{formatDate(u.lastOrderAt)}</p>
                        <p className="text-xs text-muted-foreground">{daysAgo(u.lastOrderAt)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.totalOrders === 0 ? (
                        <span className="text-muted-foreground text-xs">لا يوجد</span>
                      ) : (
                        <span className="font-semibold">{u.totalOrders}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.hasPushToken ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">🔔 نشط</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">بدون</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) setShowDialog(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إرسال إشعار للعملاء المختارين</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm space-y-1">
              <p>
                <span className="font-medium">المختارون:</span> {selected.size} عميل
              </p>
              <p>
                <span className="font-medium">لديهم إشعارات نشطة:</span>{" "}
                <span className={selectedWithToken === 0 ? "text-amber-600 font-medium" : "text-green-700 font-medium"}>
                  {selectedWithToken}
                </span>
              </p>
              {selectedWithToken < selected.size && (
                <p className="text-xs text-amber-600">
                  ⚠️ {selected.size - selectedWithToken} عميل بدون رمز push — لن يصلهم الإشعار
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">عنوان الإشعار</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="اشتقنا إليك! 🎁"
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نص الإشعار</Label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="عدنا بعروض رائعة — اطلب الآن واستمتع بتجربة توصيل سريعة!"
                maxLength={1000}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">كود خصم (اختياري)</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.promoCode}
                onChange={(e) => setForm((f) => ({ ...f, promoCode: e.target.value }))}
              >
                <option value="">— بدون كود خصم —</option>
                {activePromos.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code} — {p.type === "percent" ? `${p.value}%` : `${p.value.toLocaleString()} ل.س`}
                  </option>
                ))}
              </select>
              {form.promoCode && (
                <p className="text-xs text-muted-foreground">
                  سيُرفق الكود في بيانات الإشعار ليستخدمه العميل عند الطلب
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              إلغاء
            </Button>
            <Button
              disabled={
                sendMutation.isPending ||
                !form.title.trim() ||
                !form.body.trim() ||
                selected.size === 0
              }
              onClick={() => sendMutation.mutate()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {sendMutation.isPending ? "جاري الإرسال..." : `إرسال لـ ${selected.size} عميل 📨`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
