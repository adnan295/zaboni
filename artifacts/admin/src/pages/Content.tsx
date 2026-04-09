import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromoBanner, type RestaurantCategory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";

const ICON_SUGGESTIONS = [
  "delivery-dining", "restaurant", "payments", "local-offer", "star", "favorite",
  "coffee", "cake", "storefront", "medical-services", "fastfood", "lunch-dining",
  "local-pizza", "icecream", "ramen-dining", "set-meal",
];

const COLOR_PRESETS = [
  "#FF6B00", "#1e40af", "#065f46", "#7c3aed", "#dc2626", "#d97706", "#0891b2",
];

function BannerSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin", "banners"],
    queryFn: api.getBanners,
  });

  const emptyBanner: Omit<PromoBanner, "id" | "createdAt" | "updatedAt"> = {
    titleAr: "",
    titleEn: "",
    subtitleAr: "",
    subtitleEn: "",
    iconName: "local-offer",
    bgColor: "#FF6B00",
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
          <p className="text-sm text-muted-foreground">تظهر في الشاشة الرئيسية للتطبيق كشريط منزلق</p>
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
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">معاينة</TableHead>
                <TableHead className="text-right">العنوان (عربي)</TableHead>
                <TableHead className="text-right">النص (عربي)</TableHead>
                <TableHead className="text-right">الأيقونة</TableHead>
                <TableHead className="text-right">الترتيب</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banners.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div
                      className="w-12 h-8 rounded-md flex-shrink-0"
                      style={{ backgroundColor: b.bgColor }}
                    />
                  </TableCell>
                  <TableCell className="font-semibold" dir="rtl">{b.titleAr}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate" dir="rtl">{b.subtitleAr}</TableCell>
                  <TableCell className="font-mono text-xs">{b.iconName}</TableCell>
                  <TableCell>{b.sortOrder}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleMutation.mutate({ id: b.id, isActive: !b.isActive })}
                      className="cursor-pointer"
                    >
                      <Badge variant={b.isActive ? "default" : "secondary"} className={b.isActive ? "bg-green-600" : ""}>
                        {b.isActive ? "نشط" : "مخفي"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(b)}>تعديل</Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => { if (confirm("حذف هذا البانر؟")) deleteMutation.mutate(b.id); }}
                        disabled={deleteMutation.isPending}
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
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل البانر" : "إضافة بانر جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>العنوان (عربي) *</Label>
                <Input value={form.titleAr} onChange={(e) => setForm((f) => ({ ...f, titleAr: e.target.value }))} placeholder="توصيل سريع..." />
              </div>
              <div className="space-y-1">
                <Label>العنوان (إنجليزي)</Label>
                <Input dir="ltr" value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} placeholder="Fast delivery..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>النص (عربي)</Label>
                <Input value={form.subtitleAr} onChange={(e) => setForm((f) => ({ ...f, subtitleAr: e.target.value }))} placeholder="تابع المندوب..." />
              </div>
              <div className="space-y-1">
                <Label>النص (إنجليزي)</Label>
                <Input dir="ltr" value={form.subtitleEn} onChange={(e) => setForm((f) => ({ ...f, subtitleEn: e.target.value }))} placeholder="Track your courier..." />
              </div>
            </div>
            <div className="space-y-1">
              <Label>اسم الأيقونة (Material Icons)</Label>
              <Input dir="ltr" value={form.iconName} onChange={(e) => setForm((f) => ({ ...f, iconName: e.target.value }))} placeholder="delivery-dining" />
              <div className="flex flex-wrap gap-1 mt-1">
                {ICON_SUGGESTIONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setForm((f) => ({ ...f, iconName: icon }))}
                    className={`text-xs px-2 py-0.5 rounded border ${form.iconName === icon ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>لون الخلفية</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.bgColor}
                  onChange={(e) => setForm((f) => ({ ...f, bgColor: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border"
                />
                <Input dir="ltr" value={form.bgColor} onChange={(e) => setForm((f) => ({ ...f, bgColor: e.target.value }))} className="w-32 font-mono text-sm" />
                <div className="flex gap-1">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm((f) => ({ ...f, bgColor: c }))}
                      className="w-6 h-6 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div
                className="mt-2 rounded-lg p-3 flex items-center gap-3"
                style={{ backgroundColor: form.bgColor }}
              >
                <div>
                  <p className="text-white font-bold text-sm">{form.titleAr || "معاينة العنوان"}</p>
                  <p className="text-white/80 text-xs">{form.subtitleAr || "معاينة النص"}</p>
                </div>
              </div>
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
              disabled={!form.titleAr.trim() || saveMutation.isPending}
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

function CategoriesSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: api.getAdminCategories,
  });

  const emptyCategory: Omit<RestaurantCategory, "id" | "createdAt" | "updatedAt"> = {
    code: "",
    nameAr: "",
    nameEn: "",
    iconName: "restaurant",
    sortOrder: 0,
    isActive: true,
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantCategory | null>(null);
  const [form, setForm] = useState(emptyCategory);

  function openCreate() {
    setEditing(null);
    setForm(emptyCategory);
    setDialogOpen(true);
  }

  function openEdit(c: RestaurantCategory) {
    setEditing(c);
    setForm({
      code: c.code,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      iconName: c.iconName,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.updateCategory(editing.id, form)
        : api.createCategory(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast({ title: editing ? "تم التعديل" : "تمت الإضافة" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast({ title: "تم الحذف" });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateCategory(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const CATEGORY_ICONS = [
    "grid-view", "restaurant", "storefront", "medical-services", "coffee",
    "cake", "fastfood", "local-pizza", "ramen-dining", "set-meal", "icecream",
    "lunch-dining", "bakery-dining", "brunch-dining", "kebab-dining",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">تصنيفات المطاعم</h2>
          <p className="text-sm text-muted-foreground">الشريط الأفقي في الشاشة الرئيسية للتصفية</p>
        </div>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground">
          + إضافة تصنيف
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">جاري التحميل...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">لا توجد تصنيفات</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم (عربي)</TableHead>
                <TableHead className="text-right">الاسم (إنجليزي)</TableHead>
                <TableHead className="text-right">الأيقونة</TableHead>
                <TableHead className="text-right">الترتيب</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold" dir="rtl">{c.nameAr}</TableCell>
                  <TableCell className="text-muted-foreground" dir="ltr">{c.nameEn}</TableCell>
                  <TableCell className="font-mono text-xs">{c.iconName}</TableCell>
                  <TableCell>{c.sortOrder}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
                      className="cursor-pointer"
                    >
                      <Badge variant={c.isActive ? "default" : "secondary"} className={c.isActive ? "bg-green-600" : ""}>
                        {c.isActive ? "نشط" : "مخفي"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}>تعديل</Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => { if (confirm("حذف هذا التصنيف؟")) deleteMutation.mutate(c.id); }}
                        disabled={deleteMutation.isPending}
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
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل التصنيف" : "إضافة تصنيف جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>الكود (للفلترة) *</Label>
              <Input dir="ltr" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} placeholder="restaurants" />
              <p className="text-xs text-muted-foreground">يجب أن يطابق قيمة category في المطعم (مثل: restaurants, grocery, coffee)</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="مطاعم" />
              </div>
              <div className="space-y-1">
                <Label>الاسم (إنجليزي)</Label>
                <Input dir="ltr" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} placeholder="Restaurants" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>اسم الأيقونة (Material Icons)</Label>
              <Input dir="ltr" value={form.iconName} onChange={(e) => setForm((f) => ({ ...f, iconName: e.target.value }))} placeholder="restaurant" />
              <div className="flex flex-wrap gap-1 mt-1">
                {CATEGORY_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setForm((f) => ({ ...f, iconName: icon }))}
                    className={`text-xs px-2 py-0.5 rounded border ${form.iconName === icon ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
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
                  <option value="true">نشط</option>
                  <option value="false">مخفي</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.nameAr.trim() || !form.code.trim() || saveMutation.isPending}
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
    <div className="space-y-10" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">إدارة المحتوى</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تحكم بمحتوى الشاشة الرئيسية للتطبيق — البانرات والتصنيفات
        </p>
      </div>
      <BannerSection />
      <hr />
      <CategoriesSection />
    </div>
  );
}
