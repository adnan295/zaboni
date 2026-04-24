import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromoBanner } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ImageUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";


function BannerSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin", "banners"],
    queryFn: api.getBanners,
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin", "restaurants"],
    queryFn: api.getRestaurants,
  });

  const emptyBanner: Omit<PromoBanner, "id" | "createdAt" | "updatedAt"> = {
    image: "",
    restaurantId: null,
    titleAr: "",
    titleEn: "",
    subtitleAr: "",
    subtitleEn: "",
    iconName: "local-offer",
    bgColor: "#DC2626",
    sortOrder: 0,
    isActive: true,
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoBanner | null>(null);
  const [form, setForm] = useState(emptyBanner);

  function openCreate() {
    setEditing(null);
    setForm(emptyBanner);
    setDialogOpen(true);
  }

  function openEdit(b: PromoBanner) {
    setEditing(b);
    setForm({
      image: b.image ?? "",
      restaurantId: b.restaurantId ?? null,
      titleAr: b.titleAr,
      titleEn: b.titleEn,
      subtitleAr: b.subtitleAr,
      subtitleEn: b.subtitleEn,
      iconName: b.iconName,
      bgColor: b.bgColor,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.updateBanner(editing.id, form)
        : api.createBanner(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "banners"] });
      toast({ title: editing ? "تم التعديل" : "تمت الإضافة" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBanner(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "banners"] });
      toast({ title: "تم الحذف" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateBanner(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "banners"] }),
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">البانرات الترويجية</h2>
          <p className="text-sm text-muted-foreground">صور تظهر في الشاشة الرئيسية كشريط منزلق — اضغط عليها للانتقال لمطعم</p>
        </div>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground">
          + إضافة بانر
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">لا توجد بانرات — أضف الأول الآن</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {banners.map((b) => {
            const linkedRestaurant = restaurants.find((r) => r.id === b.restaurantId);
            return (
              <div key={b.id} className="rounded-xl border overflow-hidden bg-card shadow-sm">
                {b.image ? (
                  <img src={b.image} alt="بانر" className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-muted flex items-center justify-center text-muted-foreground text-sm">
                    لا توجد صورة
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">ترتيب: {b.sortOrder}</span>
                    <button onClick={() => toggleMutation.mutate({ id: b.id, isActive: !b.isActive })} className="cursor-pointer">
                      <Badge variant={b.isActive ? "default" : "secondary"} className={b.isActive ? "bg-green-600" : ""}>
                        {b.isActive ? "نشط" : "مخفي"}
                      </Badge>
                    </button>
                  </div>
                  {b.titleAr && (
                    <p className="text-xs font-medium truncate">{b.titleAr}</p>
                  )}
                  {linkedRestaurant && (
                    <p className="text-xs text-muted-foreground truncate">
                      مطعم: {linkedRestaurant.nameAr}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(b)}>تعديل</Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { if (confirm("حذف هذا البانر؟")) deleteMutation.mutate(b.id); }}
                      disabled={deleteMutation.isPending}
                    >
                      حذف
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل البانر" : "إضافة بانر جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>صورة البانر *</Label>
              <ImageUpload
                value={form.image}
                onChange={(url) => setForm((f) => ({ ...f, image: url }))}
                folder="banners"
              />
            </div>
            <div className="space-y-1">
              <Label>نص البانر (اختياري)</Label>
              <Input
                value={form.titleAr}
                onChange={(e) => setForm((f) => ({ ...f, titleAr: e.target.value }))}
                placeholder="مثال: عروض اليوم أو اسم المطعم"
              />
              <p className="text-xs text-muted-foreground">يظهر كنص علوي فوق الصورة في التطبيق — اتركه فارغاً إذا لم تحتج نصاً</p>
            </div>
            <div className="space-y-1">
              <Label>الربط بمطعم (اختياري)</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.restaurantId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, restaurantId: e.target.value || null }))}
              >
                <option value="">— لا يوجد ربط —</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.nameAr}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">عند الضغط على البانر في التطبيق يفتح صفحة هذا المطعم</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>الترتيب</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <Label>الحالة</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.isActive ? "true" : "false"}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "true" }))}
                >
                  <option value="true">نشط (يظهر في التطبيق)</option>
                  <option value="false">مخفي</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-primary text-primary-foreground"
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ContentPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">المحتوى</h1>
        <p className="text-muted-foreground text-sm mt-1">
          البانرات الترويجية التي تظهر في الشاشة الرئيسية للتطبيق
        </p>
      </div>
      <BannerSection />
    </div>
  );
}
