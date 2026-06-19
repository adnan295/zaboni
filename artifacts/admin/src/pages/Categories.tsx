import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { ImageUpload } from "@/components/ImageUpload";

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
  imageUrl: string;
  isActive: boolean;
};

const emptyForm: CategoryForm = {
  nameAr: "",
  iconName: "restaurant",
  imageUrl: "",
  isActive: true,
};

function SortableCategoryRow({
  cat,
  onEdit,
  onDelete,
  onToggle,
  isDeleting,
}: {
  cat: RestaurantCategory;
  onEdit: (c: RestaurantCategory) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  isDeleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const icon = ICONS.find((i) => i.value === cat.iconName);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 bg-card border rounded-xl px-3 py-2.5 mb-2 ${
        !cat.isActive ? "opacity-50" : ""
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="text-zinc-400 hover:text-zinc-600 text-lg px-1 cursor-grab active:cursor-grabbing shrink-0"
        title="اسحب لتغيير الترتيب"
      >
        ⠿
      </span>

      {cat.imageUrl ? (
        <img
          src={cat.imageUrl}
          alt={cat.nameAr}
          className="w-9 h-9 rounded-full object-cover shrink-0 border"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg shrink-0">
          {icon?.name ?? "📦"}
        </div>
      )}

      <span className="flex-1 font-semibold text-sm">{cat.nameAr}</span>

      <button
        onClick={() => onToggle(cat.id, !cat.isActive)}
        className="cursor-pointer shrink-0"
        title={cat.isActive ? "إخفاء التصنيف" : "إظهار التصنيف"}
      >
        <Badge
          variant={cat.isActive ? "default" : "secondary"}
          className={cat.isActive ? "bg-green-600 text-xs" : "text-xs"}
        >
          {cat.isActive ? "نشط" : "مخفي"}
        </Badge>
      </button>

      <Button
        size="sm"
        variant="outline"
        className="text-xs shrink-0 h-7"
        onClick={() => onEdit(cat)}
      >
        تعديل
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="text-xs shrink-0 h-7"
        onClick={() => {
          if (confirm("حذف هذا التصنيف؟")) onDelete(cat.id);
        }}
        disabled={isDeleting}
      >
        حذف
      </Button>
    </div>
  );
}

export default function CategoriesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: categoriesRaw = [], isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: api.getAdminCategories,
  });

  const { data: settings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: api.getSettings,
  });

  const showAllTab = (settings?.["show_all_tab"] ?? "1") !== "0";

  const [items, setItems] = useState<RestaurantCategory[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems(categoriesRaw);
    setDirty(false);
  }, [categoriesRaw]);

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
    setForm({ nameAr: c.nameAr, iconName: c.iconName, imageUrl: c.imageUrl ?? "", isActive: c.isActive });
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
        imageUrl: form.imageUrl || null,
        isActive: form.isActive,
        sortOrder: editing?.sortOrder ?? categoriesRaw.length,
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

  const reorderMutation = useMutation({
    mutationFn: (order: { id: string; sortOrder: number }[]) =>
      api.reorderCategories(order),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      toast({ title: "تم الحفظ", description: "تم حفظ الترتيب الجديد" });
      setDirty(false);
    },
    onError: (e: Error) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const toggleAllTabMutation = useMutation({
    mutationFn: (show: boolean) =>
      api.updateSettings({ show_all_tab: show ? "1" : "0" }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
    onError: (e: Error) =>
      toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  }, []);

  const handleSaveOrder = () => {
    reorderMutation.mutate(items.map((item, i) => ({ id: item.id, sortOrder: i })));
  };

  const selectedIcon = ICONS.find((i) => i.value === form.iconName);

  const isDuplicateName = categoriesRaw.some(
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
            الشريط الأفقي في الشاشة الرئيسية — اسحب لترتيب التصنيفات
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button onClick={handleSaveOrder} disabled={reorderMutation.isPending}>
              {reorderMutation.isPending ? "جاري الحفظ..." : "💾 حفظ الترتيب"}
            </Button>
          )}
          <Button onClick={openCreate} className="bg-primary text-primary-foreground">
            + إضافة تصنيف
          </Button>
        </div>
      </div>

      {/* "الكل" tab control */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg">☰</div>
          <div>
            <p className="font-semibold text-sm">تبويب "الكل"</p>
            <p className="text-xs text-muted-foreground">يظهر دائماً أول الشريط ويعرض جميع المطاعم</p>
          </div>
        </div>
        <button
          onClick={() => toggleAllTabMutation.mutate(!showAllTab)}
          disabled={toggleAllTabMutation.isPending}
          className="cursor-pointer"
        >
          <Badge
            variant={showAllTab ? "default" : "secondary"}
            className={showAllTab ? "bg-green-600" : ""}
          >
            {showAllTab ? "ظاهر" : "مخفي"}
          </Badge>
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">جاري التحميل...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="font-medium">لا توجد تصنيفات بعد</p>
          <p className="text-sm mt-1">أضف أول تصنيف الآن</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((c) => (
              <SortableCategoryRow
                key={c.id}
                cat={c}
                onEdit={openEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </SortableContext>
        </DndContext>
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

            <div className="space-y-1.5">
              <ImageUpload
                label="صورة التصنيف (اختيارية)"
                value={form.imageUrl}
                onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              />
            </div>

            <div className="space-y-2">
              <Label>الأيقونة (احتياطي إذا لم تُرفع صورة)</Label>
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
