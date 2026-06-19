import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RestaurantPromo } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PromoFormData = {
  code: string;
  type: "percent" | "fixed";
  value: string;
  maxUses: string;
  maxUsesPerUser: string;
  expiresAt: string;
  isActive: boolean;
};

const emptyForm = (): PromoFormData => ({
  code: "",
  type: "percent",
  value: "",
  maxUses: "",
  maxUsesPerUser: "1",
  expiresAt: "",
  isActive: true,
});

function formatExpiry(val: string | null): string {
  if (!val) return "—";
  const d = new Date(val);
  return d.toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" });
}

function isExpired(val: string | null): boolean {
  if (!val) return false;
  return new Date(val) < new Date();
}

export default function Promos() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantPromo | null>(null);
  const [form, setForm] = useState<PromoFormData>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ["restaurant-promos"],
    queryFn: () => api.getPromos(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createPromo>[0]) => api.createPromo(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant-promos"] });
      setDialogOpen(false);
      toast({ title: "تم إنشاء الكود بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updatePromo>[1] }) =>
      api.updatePromo(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant-promos"] });
      setDialogOpen(false);
      toast({ title: "تم تحديث الكود" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePromo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurant-promos"] });
      setDeleteId(null);
      toast({ title: "تم حذف الكود" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(promo: RestaurantPromo) {
    setEditing(promo);
    setForm({
      code: promo.code,
      type: promo.type,
      value: String(promo.value),
      maxUses: promo.maxUses != null ? String(promo.maxUses) : "",
      maxUsesPerUser: String(promo.maxUsesPerUser),
      expiresAt: promo.expiresAt ? promo.expiresAt.slice(0, 10) : "",
      isActive: promo.isActive,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: parseFloat(form.value),
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      maxUsesPerUser: parseInt(form.maxUsesPerUser) || 1,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive: form.isActive,
    };
    if (!parsed.code || isNaN(parsed.value) || parsed.value <= 0) {
      toast({ title: "يرجى تعبئة الكود والقيمة بشكل صحيح", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: parsed });
    } else {
      createMutation.mutate(parsed);
    }
  }

  function toggleActive(promo: RestaurantPromo) {
    updateMutation.mutate({ id: promo.id, data: { isActive: !promo.isActive } });
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">أنشئ وأدر أكواد خصم خاصة بمطعمك</p>
        </div>
        <Button onClick={openCreate}>+ كود جديد</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جارٍ التحميل...</div>
      ) : promos.length === 0 ? (
        <div className="text-center py-20 border rounded-xl border-dashed text-muted-foreground">
          <div className="text-4xl mb-3">🎟️</div>
          <p className="font-medium mb-1">لا توجد أكواد خصم بعد</p>
          <p className="text-sm">أنشئ أول كود لتحفيز زبائنك على الطلب من مطعمك</p>
          <Button className="mt-4" onClick={openCreate}>إنشاء كود</Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-right px-4 py-3 font-medium">الكود</th>
                <th className="text-right px-4 py-3 font-medium">الخصم</th>
                <th className="text-right px-4 py-3 font-medium">الاستخدامات</th>
                <th className="text-right px-4 py-3 font-medium">الانتهاء</th>
                <th className="text-right px-4 py-3 font-medium">الحالة</th>
                <th className="text-right px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {promos.map((promo) => {
                const expired = isExpired(promo.expiresAt);
                return (
                  <tr key={promo.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
                        {promo.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {promo.type === "percent"
                        ? `${promo.value}%`
                        : `${promo.value.toLocaleString("ar-SY")} ل.س`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground font-medium">{Number(promo.usedCount)}</span>
                      {promo.maxUses != null && (
                        <span className="text-muted-foreground"> / {promo.maxUses}</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 ${expired ? "text-red-500" : "text-muted-foreground"}`}>
                      {expired && <span className="text-xs ml-1">(منتهي)</span>}
                      {formatExpiry(promo.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(promo)}
                        disabled={updateMutation.isPending}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          promo.isActive ? "bg-green-500" : "bg-muted-foreground/30"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            promo.isActive ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(promo)}>
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:text-red-600 border-red-200 hover:border-red-300"
                          onClick={() => setDeleteId(promo.id)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الكود" : "إنشاء كود خصم جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="code">الكود *</Label>
              <Input
                id="code"
                placeholder="مثال: BURGER20"
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>نوع الخصم *</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as "percent" | "fixed" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">نسبة مئوية %</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت ل.س</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="value">
                  {form.type === "percent" ? "النسبة (1-100)" : "المبلغ (ل.س)"} *
                </Label>
                <Input
                  id="value"
                  type="number"
                  min="0.01"
                  max={form.type === "percent" ? "100" : undefined}
                  step="0.01"
                  placeholder={form.type === "percent" ? "مثال: 20" : "مثال: 5000"}
                  value={form.value}
                  onChange={(e) => setForm(f => ({ ...f, value: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="maxUses">الحد الأقصى للاستخدام</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  placeholder="غير محدود"
                  value={form.maxUses}
                  onChange={(e) => setForm(f => ({ ...f, maxUses: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxUsesPerUser">مرات لكل مستخدم</Label>
                <Input
                  id="maxUsesPerUser"
                  type="number"
                  min="1"
                  value={form.maxUsesPerUser}
                  onChange={(e) => setForm(f => ({ ...f, maxUsesPerUser: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="expiresAt">تاريخ الانتهاء</Label>
              <Input
                id="expiresAt"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  form.isActive ? "bg-green-500" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.isActive ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}>
                {form.isActive ? "الكود مفعّل" : "الكود موقف"}
              </Label>
            </div>

            <DialogFooter className="gap-2 flex-row-reverse">
              <Button type="submit" disabled={isBusy}>
                {isBusy ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إنشاء الكود"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">هل أنت متأكد من حذف هذا الكود؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {deleteMutation.isPending ? "جارٍ الحذف..." : "حذف"}
            </Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
