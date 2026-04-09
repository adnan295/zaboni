import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DeliveryZone } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const EMPTY_FORM = {
  label: "",
  fromKm: "",
  toKm: "",
  fee: "",
  isActive: true,
};

export default function DeliveryZones() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editZone, setEditZone] = useState<DeliveryZone | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["admin", "delivery-zones"],
    queryFn: api.getDeliveryZones,
  });

  const createMut = useMutation({
    mutationFn: api.createDeliveryZone,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "delivery-zones"] });
      setDialogOpen(false);
      toast({ title: "تمت الإضافة", description: "تم إنشاء النطاق بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DeliveryZone> }) =>
      api.updateDeliveryZone(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "delivery-zones"] });
      setDialogOpen(false);
      toast({ title: "تم التحديث", description: "تم تحديث النطاق بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteDeliveryZone,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "delivery-zones"] });
      setDeleteConfirm(null);
      toast({ title: "تم الحذف", description: "تم حذف النطاق" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditZone(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (z: DeliveryZone) => {
    setEditZone(z);
    setForm({
      label: z.label ?? "",
      fromKm: String(z.fromKm),
      toKm: String(z.toKm),
      fee: String(z.fee),
      isActive: z.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const fromKm = parseFloat(form.fromKm);
    const toKm = parseFloat(form.toKm);
    const fee = parseInt(form.fee, 10);
    if (isNaN(fromKm) || isNaN(toKm) || isNaN(fee)) {
      toast({ title: "خطأ", description: "يرجى إدخال قيم صحيحة", variant: "destructive" });
      return;
    }
    if (toKm <= fromKm) {
      toast({ title: "خطأ", description: "يجب أن يكون الحد الأقصى أكبر من الحد الأدنى", variant: "destructive" });
      return;
    }
    const payload = {
      label: form.label.trim() || null,
      fromKm,
      toKm,
      fee,
      isActive: form.isActive,
    };
    if (editZone) {
      updateMut.mutate({ id: editZone.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isMutating = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">نطاقات التوصيل</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تسعيرة التوصيل بحسب المسافة — السائق يحتفظ بـ 100٪ من رسوم التوصيل
          </p>
        </div>
        <Button onClick={openCreate}>+ إضافة نطاق</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-muted/30">
          <p className="text-4xl mb-3">📍</p>
          <p className="font-semibold text-lg">لا توجد نطاقات بعد</p>
          <p className="text-muted-foreground text-sm mt-1">
            أضف نطاقات توصيل لتحديد رسوم التوصيل تلقائياً حسب المسافة
          </p>
          <Button className="mt-4" onClick={openCreate}>إضافة أول نطاق</Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>من (كم)</TableHead>
                <TableHead>إلى (كم)</TableHead>
                <TableHead>رسوم التوصيل (ل.س)</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((zone) => (
                <TableRow key={zone.id}>
                  <TableCell className="font-medium">
                    {zone.label ?? <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                  <TableCell>{zone.fromKm} كم</TableCell>
                  <TableCell>{zone.toKm} كم</TableCell>
                  <TableCell className="font-semibold text-orange-600">
                    {zone.fee.toLocaleString()} ل.س
                  </TableCell>
                  <TableCell>
                    <Badge variant={zone.isActive ? "default" : "secondary"}>
                      {zone.isActive ? "مفعّل" : "معطّل"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(zone)}>
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteConfirm(zone.id)}
                      >
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editZone ? "تعديل النطاق" : "إضافة نطاق جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>الاسم (اختياري)</Label>
              <Input
                placeholder="مثال: داخل المدينة"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>من (كم)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="0"
                  value={form.fromKm}
                  onChange={(e) => setForm((f) => ({ ...f, fromKm: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>إلى (كم)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="5"
                  value={form.toKm}
                  onChange={(e) => setForm((f) => ({ ...f, toKm: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>رسوم التوصيل (ل.س)</Label>
              <Input
                type="number"
                min="0"
                step="500"
                placeholder="5000"
                value={form.fee}
                onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="isActive"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="isActive">مفعّل</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={isMutating}>
              {isMutating ? "جاري الحفظ..." : editZone ? "حفظ التغييرات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            هل أنت متأكد من حذف هذا النطاق؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteConfirm && deleteMut.mutate(deleteConfirm)}
            >
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
