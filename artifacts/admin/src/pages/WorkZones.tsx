import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { WorkZone } from "@/lib/api";
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
  name: "",
  nameAr: "",
  city: "",
  isActive: true,
};

export default function WorkZones() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editZone, setEditZone] = useState<WorkZone | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["admin", "work-zones"],
    queryFn: api.getWorkZones,
  });

  const createMut = useMutation({
    mutationFn: api.createWorkZone,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "work-zones"] });
      setDialogOpen(false);
      toast({ title: "تمت الإضافة", description: "تم إنشاء منطقة العمل بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WorkZone> }) =>
      api.updateWorkZone(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "work-zones"] });
      setDialogOpen(false);
      toast({ title: "تم التحديث", description: "تم تحديث منطقة العمل بنجاح" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteWorkZone,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "work-zones"] });
      qc.invalidateQueries({ queryKey: ["admin", "couriers"] });
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      setDeleteConfirm(null);
      toast({ title: "تم الحذف", description: "تم حذف منطقة العمل" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditZone(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (z: WorkZone) => {
    setEditZone(z);
    setForm({
      name: z.name,
      nameAr: z.nameAr,
      city: z.city,
      isActive: z.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.nameAr.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المنطقة", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      nameAr: form.nameAr.trim(),
      city: form.city.trim(),
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
          <h1 className="text-2xl font-bold">مناطق العمل</h1>
          <p className="text-sm text-muted-foreground mt-1">
            كل مطعم ومندوب يُسند إلى منطقة عمل — الطلبات تُرسل فقط لمندوبي المنطقة المطابقة
          </p>
        </div>
        <Button onClick={openCreate}>+ إضافة منطقة</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-muted/30">
          <p className="text-4xl mb-3">🗺️</p>
          <p className="font-semibold text-lg">لا توجد مناطق عمل بعد</p>
          <p className="text-muted-foreground text-sm mt-1">
            أضف مناطق عمل لتوجيه الطلبات إلى المندوبين المناسبين
          </p>
          <Button className="mt-4" onClick={openCreate}>إضافة أول منطقة</Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم (عربي)</TableHead>
                <TableHead>الاسم (إنجليزي)</TableHead>
                <TableHead>المدينة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((zone) => (
                <TableRow key={zone.id}>
                  <TableCell className="font-medium">{zone.nameAr}</TableCell>
                  <TableCell>{zone.name}</TableCell>
                  <TableCell>
                    {zone.city || <span className="text-muted-foreground text-sm">—</span>}
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
            <DialogTitle>{editZone ? "تعديل منطقة العمل" : "إضافة منطقة عمل جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>الاسم (عربي)</Label>
              <Input
                dir="rtl"
                placeholder="مثال: دمشق - المزة"
                value={form.nameAr}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>الاسم (إنجليزي)</Label>
              <Input
                placeholder="e.g. Damascus - Mazzeh"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>المدينة (اختياري)</Label>
              <Input
                dir="rtl"
                placeholder="دمشق"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
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
            هل أنت متأكد من حذف هذه المنطقة؟ سيتم إلغاء إسنادها من أي مطاعم أو مندوبين مرتبطين بها.
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
