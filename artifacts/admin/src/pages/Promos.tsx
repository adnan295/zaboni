import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromoCode } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function PromoFormDialog({
  open,
  promo,
  onClose,
}: {
  open: boolean;
  promo: PromoCode | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!promo;

  const buildForm = (p: PromoCode | null) => ({
    code: p?.code ?? "",
    type: (p?.type ?? "fixed") as "percent" | "fixed",
    value: String(p?.value ?? ""),
    maxUses: p?.maxUses != null ? String(p.maxUses) : "",
    maxUsesPerUser: String(p?.maxUsesPerUser ?? 1),
    expiresAt: p?.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 16) : "",
    isActive: p?.isActive ?? true,
  });

  const [form, setForm] = useState(buildForm(promo));

  useEffect(() => {
    if (open) setForm(buildForm(promo));
  }, [open, promo]);

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createPromo>[0]) =>
      isEdit ? api.updatePromo(promo!.id, data) : api.createPromo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
      toast({ title: isEdit ? "تم تحديث الكود" : "تم إنشاء الكود" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      code: form.code.toUpperCase(),
      type: form.type,
      value: parseFloat(form.value),
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      maxUsesPerUser: parseInt(form.maxUsesPerUser) || 1,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive: form.isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل كود الخصم" : "إنشاء كود خصم"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">الكود</label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER20"
              disabled={isEdit}
              required
              maxLength={50}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">النوع</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "percent" | "fixed" }))}
              >
                <option value="fixed">ثابت (ل.س)</option>
                <option value="percent">نسبة مئوية (%)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">القيمة</label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === "percent" ? "20" : "5000"}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">الحد الأقصى للاستخدام</label>
              <Input
                type="number"
                min="1"
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                placeholder="غير محدود"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">الحد لكل مستخدم</label>
              <Input
                type="number"
                min="1"
                value={form.maxUsesPerUser}
                onChange={(e) => setForm((f) => ({ ...f, maxUsesPerUser: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">تاريخ الانتهاء (اختياري)</label>
            <Input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4"
            />
            <label htmlFor="isActive" className="text-sm font-medium">مفعّل</label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : "إنشاء"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PromosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "promos"],
    queryFn: api.getPromos,
    refetchInterval: 15_000,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);

  const deleteMutation = useMutation({
    mutationFn: api.deletePromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
      toast({ title: "تم حذف الكود" });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updatePromo(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
    },
  });

  const handleDelete = (id: string, code: string) => {
    if (!confirm(`حذف الكود "${code}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    deleteMutation.mutate(id);
  };

  const active = data?.filter((p) => p.isActive) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">أكواد الخصم</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة أكواد الخصم للعملاء</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          + كود جديد
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{data.length}</div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي الأكواد</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-500">{active.length}</div>
              <div className="text-sm text-muted-foreground mt-1">نشط</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-500">
                {data.reduce((s, p) => s + (p.usesCount ?? 0), 0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي الاستخدامات</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">جاري التحميل...</div>
          )}
          {data && data.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <span className="text-3xl">🎟️</span>
              <span className="text-sm">لا توجد أكواد خصم بعد</span>
            </div>
          )}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">الكود</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">النوع</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">القيمة</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">الاستخدامات</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">ينتهي في</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => {
                    const expired = p.expiresAt ? new Date(p.expiresAt) < new Date() : false;
                    const exhausted = p.maxUses != null && (p.usesCount ?? 0) >= p.maxUses;
                    return (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-primary">{p.code}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.type === "percent" ? "نسبة %" : "ثابت"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {p.type === "percent" ? `${p.value}%` : `${p.value.toLocaleString()} ل.س`}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.usesCount ?? 0}{p.maxUses != null ? ` / ${p.maxUses}` : ""}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {p.expiresAt
                            ? new Date(p.expiresAt).toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" })
                            : <span className="italic">لا ينتهي</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            !p.isActive || expired || exhausted
                              ? "bg-muted text-muted-foreground"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}>
                            {!p.isActive ? "معطّل" : expired ? "منتهي" : exhausted ? "مستنفَد" : "نشط"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setEditing(p); setDialogOpen(true); }}
                            >
                              تعديل
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleMutation.mutate({ id: p.id, isActive: !p.isActive })}
                              disabled={toggleMutation.isPending}
                            >
                              {p.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(p.id, p.code)}
                              disabled={deleteMutation.isPending}
                            >
                              حذف
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PromoFormDialog
        open={dialogOpen}
        promo={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />
    </div>
  );
}
