import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RestaurantCategory } from "@/lib/api";
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
import { useToast } from "@/hooks/use-toast";

const ICONS: { name: string; label: string; value: string }[] = [
  { value: "grid-view",         label: "الكل",          name: "☰" },
  { value: "restaurant",        label: "مطاعم",          name: "🍽️" },
  { value: "storefront",        label: "محلات",          name: "🏪" },
  { value: "medical-services",  label: "صيدلية",         name: "💊" },
  { value: "coffee",            label: "قهوة",           name: "☕" },
  { value: "cake",              label: "حلويات",          name: "🎂" },
  { value: "fastfood",          label: "وجبات سريعة",    name: "🍟" },
  { value: "local-pizza",       label: "بيتزا",          name: "🍕" },
  { value: "ramen-dining",      label: "مطبخ آسيوي",     name: "🍜" },
  { value: "icecream",          label: "آيس كريم",       name: "🍦" },
  { value: "kebab-dining",      label: "مشاوي",          name: "🥙" },
  { value: "local-grocery-store", label: "بقالية",       name: "🛒" },
  { value: "bakery-dining",     label: "مخبز",           name: "🥐" },
  { value: "set-meal",          label: "وجبة كاملة",     name: "🍱" },
];

function toCode(iconName: string): string {
  const base = iconName.replace(/-/g, "_").replace(/[^a-z0-9_]/g, "") || "category";
  return `${base}_${Date.now().toString(36)}`;
}

type CategoryForm = {
  nameAr: string;
  iconName: string;
  isActive: boolean;
};

const emptyForm: CategoryForm = {
  nameAr: "",
  iconName: "restaurant",
  isActive: true,
};

export default function CategoriesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: api.getAdminCategories,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: RestaurantCategory) {
    setEditing(c);
    setForm({ nameAr: c.nameAr, iconName: c.iconName, isActive: c.isActive });
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const code = editing ? editing.code : toCode(form.iconName);
      const payload = {
        code,
        nameAr: form.nameAr,
        nameEn: form.nameAr,
        iconName: form.iconName,
        isActive: form.isActive,
        sortOrder: editing?.sortOrder ?? categories.length,
      };
      return editing
        ? api.updateCategory(editing.id, payload)
        : api.createCategory(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast({ title: editing ? "تم التعديل" : "تمت الإضافة" });
      setDialogOpen(false);
    },
    onError: (e: Error) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast({ title: "تم الحذف" });
    },
    onError: (e: Error) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateCategory(id, { isActive }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
    onError: (e: Error) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const selectedIcon = ICONS.find((i) => i.value === form.iconName);

  const isDuplicateName = categories.some(
    (c) =>
      c.nameAr.trim() === form.nameAr.trim() &&
      (!editing || c.id !== editing.id)
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">التصنيفات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            الشريط الأفقي في الشاشة الرئيسية للتطبيق — يتيح للمستخدمين تصفية المنشآت
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary text-primary-foreground">
          + إضافة تصنيف
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جاري التحميل...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="font-medium">لا توجد تصنيفات بعد</p>
          <p className="text-sm mt-1">أضف أول تصنيف الآن</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {categories.map((c) => {
            const icon = ICONS.find((i) => i.value === c.iconName);
            return (
              <div
                key={c.id}
                className="rounded-2xl border bg-card p-4 flex flex-col items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="text-4xl">{icon?.name ?? "📦"}</div>
                <p className="font-bold text-center text-sm leading-tight">{c.nameAr}</p>
                <button
                  onClick={() =>
                    toggleMutation.mutate({ id: c.id, isActive: !c.isActive })
                  }
                  className="cursor-pointer"
                >
                  <Badge
                    variant={c.isActive ? "default" : "secondary"}
                    className={c.isActive ? "bg-green-600" : ""}
                  >
                    {c.isActive ? "نشط" : "مخفي"}
                  </Badge>
                </button>
                <div className="flex gap-2 w-full">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => openEdit(c)}
                  >
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-xs"
                    onClick={() => {
                      if (confirm("حذف هذا التصنيف؟")) deleteMutation.mutate(c.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    حذف
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "تعديل التصنيف" : "إضافة تصنيف جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label>اسم التصنيف *</Label>
              <Input
                value={form.nameAr}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nameAr: e.target.value }))
                }
                placeholder="مثال: صيدلية، بقالية، مطاعم..."
                className={isDuplicateName ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {isDuplicateName && (
                <p className="text-xs text-destructive">
                  يوجد تصنيف بهذا الاسم مسبقًا، يرجى اختيار اسم مختلف.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>الأيقونة</Label>
              <div className="grid grid-cols-4 gap-2">
                {ICONS.map((icon) => (
                  <button
                    key={icon.value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, iconName: icon.value }))
                    }
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all ${
                      form.iconName === icon.value
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className="text-2xl">{icon.name}</span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {icon.label}
                    </span>
                  </button>
                ))}
              </div>
              {selectedIcon && (
                <p className="text-xs text-center text-muted-foreground">
                  تم اختيار: {selectedIcon.name} {selectedIcon.label}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>الحالة</Label>
              <div className="flex gap-3">
                {[
                  { value: true, label: "نشط (يظهر في التطبيق)" },
                  { value: false, label: "مخفي" },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, isActive: opt.value }))
                    }
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.isActive === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.nameAr.trim() || isDuplicateName || saveMutation.isPending}
              className="bg-primary text-primary-foreground"
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
