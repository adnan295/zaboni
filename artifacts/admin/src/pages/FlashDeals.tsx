import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type FlashDeal, type Restaurant } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function toLocalDateTimeInput(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(val: string): string {
  return new Date(val).toISOString();
}

function getDealStatus(deal: FlashDeal): { label: string; color: string } {
  const now = Date.now();
  const start = new Date(deal.startsAt).getTime();
  const end = new Date(deal.endsAt).getTime();
  if (!deal.isActive) return { label: "معطل", color: "text-gray-500" };
  if (now < start) return { label: "لم يبدأ بعد", color: "text-blue-500" };
  if (now > end) return { label: "انتهى", color: "text-red-500" };
  if (deal.maxUses != null && deal.usedCount >= deal.maxUses) return { label: "استُنفد", color: "text-orange-500" };
  return { label: "نشط ⚡", color: "text-green-600" };
}

const defaultForm = {
  restaurantId: "",
  title: "",
  discountType: "percent" as "percent" | "fixed",
  discountValue: 10,
  startsAt: "",
  endsAt: "",
  maxUses: "",
  isActive: true,
};

type FormState = typeof defaultForm;

export default function FlashDeals() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: deals = [], isLoading } = useQuery({ queryKey: ["admin", "flash-deals"], queryFn: api.getFlashDeals });
  const { data: restaurants = [] } = useQuery({ queryKey: ["admin", "restaurants"], queryFn: api.getRestaurants });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createFlashDeal>[0]) => api.createFlashDeal(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "flash-deals"] }); setOpen(false); toast({ description: "تم إنشاء العرض" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateFlashDeal>[1] }) => api.updateFlashDeal(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "flash-deals"] }); setOpen(false); toast({ description: "تم تحديث العرض" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFlashDeal(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "flash-deals"] }); setDeleteId(null); toast({ description: "تم حذف العرض" }); },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 3600 * 1000);
    setEditId(null);
    setForm({
      ...defaultForm,
      startsAt: toLocalDateTimeInput(now.toISOString()),
      endsAt: toLocalDateTimeInput(end.toISOString()),
    });
    setOpen(true);
  }

  function openEdit(deal: FlashDeal) {
    setEditId(deal.id);
    setForm({
      restaurantId: deal.restaurantId,
      title: deal.title,
      discountType: deal.discountType,
      discountValue: deal.discountValue,
      startsAt: toLocalDateTimeInput(deal.startsAt),
      endsAt: toLocalDateTimeInput(deal.endsAt),
      maxUses: deal.maxUses != null ? String(deal.maxUses) : "",
      isActive: deal.isActive,
    });
    setOpen(true);
  }

  function handleSubmit() {
    const payload = {
      restaurantId: form.restaurantId,
      title: form.title.trim(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      startsAt: fromLocalDateTimeInput(form.startsAt),
      endsAt: fromLocalDateTimeInput(form.endsAt),
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      isActive: form.isActive,
    };
    if (!payload.restaurantId || !payload.title || !payload.discountValue || !payload.startsAt || !payload.endsAt) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚡ عروض فلاش</h1>
          <p className="text-muted-foreground text-sm mt-1">عروض خصم مؤقتة تُطبَّق تلقائياً عند الطلب</p>
        </div>
        <Button onClick={openCreate}>+ إضافة عرض</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">لا توجد عروض فلاش حتى الآن</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-right font-medium">المطعم</th>
                <th className="px-4 py-3 text-right font-medium">العنوان</th>
                <th className="px-4 py-3 text-right font-medium">الخصم</th>
                <th className="px-4 py-3 text-right font-medium">الفترة</th>
                <th className="px-4 py-3 text-right font-medium">الاستخدام</th>
                <th className="px-4 py-3 text-right font-medium">الحالة</th>
                <th className="px-4 py-3 text-right font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deals.map((deal) => {
                const status = getDealStatus(deal);
                return (
                  <tr key={deal.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{deal.restaurantName ?? deal.restaurantId}</td>
                    <td className="px-4 py-3">{deal.title}</td>
                    <td className="px-4 py-3 font-mono">
                      {deal.discountType === "percent" ? `${deal.discountValue}%` : `${deal.discountValue.toLocaleString()} ل.س`}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>{new Date(deal.startsAt).toLocaleString("ar-SY")}</div>
                      <div>← {new Date(deal.endsAt).toLocaleString("ar-SY")}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {deal.usedCount}{deal.maxUses != null ? ` / ${deal.maxUses}` : ""}
                    </td>
                    <td className={`px-4 py-3 font-medium ${status.color}`}>{status.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(deal)}>تعديل</Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteId(deal.id)}>حذف</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل عرض فلاش" : "إضافة عرض فلاش"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>المطعم *</Label>
              <Select value={form.restaurantId} onValueChange={(v) => setForm((f) => ({ ...f, restaurantId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المطعم" />
                </SelectTrigger>
                <SelectContent>
                  {(restaurants as Restaurant[]).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>عنوان العرض *</Label>
              <Input
                placeholder="مثال: خصم نهاية الأسبوع"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>نوع الخصم *</Label>
                <Select value={form.discountType} onValueChange={(v: "percent" | "fixed") => setForm((f) => ({ ...f, discountType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">نسبة مئوية (%)</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت (ل.س)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>قيمة الخصم *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>تاريخ البداية *</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>تاريخ النهاية *</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>الحد الأقصى للاستخدام (اختياري)</Label>
              <Input
                type="number"
                min={1}
                placeholder="بلا حد"
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                id="isActive"
              />
              <Label htmlFor="isActive">العرض نشط</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isBusy}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={isBusy}>{isBusy ? "جارٍ الحفظ..." : "حفظ"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العرض</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا العرض؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
