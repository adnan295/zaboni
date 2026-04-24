import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Restaurant, type MenuItem, type RestaurantHour } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/ImageUpload";
import LocationPicker from "@/components/LocationPicker";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type RestaurantForm = Omit<Restaurant, "id">;
type MenuItemForm = Omit<MenuItem, "id" | "restaurantId">;

const emptyRestaurant: RestaurantForm = {
  name: "",
  nameAr: "",
  category: "",
  categoryAr: "",
  rating: 0,
  reviewCount: 0,
  deliveryTime: "30-45 دقيقة",
  deliveryFee: 0,
  minOrder: 0,
  image: "",
  tags: [],
  isOpen: true,
  discount: null,
  lat: null,
  lon: null,
  phone: null,
};

const emptyMenuItem: MenuItemForm = {
  name: "",
  nameAr: "",
  description: "",
  descriptionAr: "",
  price: 0,
  image: "",
  category: "",
  categoryAr: "",
  isPopular: false,
};

function RestaurantFormDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: RestaurantForm;
  onSave: (data: RestaurantForm) => void;
  saving?: boolean;
}) {
  const [form, setForm] = useState<RestaurantForm>(initial);

  const { data: categories = [] } = useQuery({
    queryKey: ["adminCategories"],
    queryFn: api.getAdminCategories,
    staleTime: 5 * 60 * 1000,
  });

  const set = <K extends keyof RestaurantForm>(
    k: K,
    v: RestaurantForm[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial.name ? "تعديل المطعم" : "مطعم جديد"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label>الاسم (إنجليزي)</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Restaurant name"
            />
          </div>
          <div className="space-y-1">
            <Label>الاسم (عربي)</Label>
            <Input
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => set("nameAr", e.target.value)}
              placeholder="اسم المطعم"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>نوع المنشأة</Label>
            <Select
              value={form.category}
              onValueChange={(code) => {
                const cat = categories.find((c) => c.code === code);
                if (cat) {
                  set("category", cat.code);
                  set("categoryAr", cat.nameAr);
                }
              }}
            >
              <SelectTrigger dir="rtl">
                <SelectValue placeholder="اختر نوع المنشأة..." />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.code}>
                    {cat.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>التقييم (0–5)</Label>
            <Input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={form.rating}
              onChange={(e) => set("rating", parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>عدد التقييمات</Label>
            <Input
              type="number"
              min={0}
              value={form.reviewCount}
              onChange={(e) => set("reviewCount", parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label>وقت التوصيل</Label>
            <Input
              value={form.deliveryTime}
              onChange={(e) => set("deliveryTime", e.target.value)}
              placeholder="30-45 دقيقة"
            />
          </div>
          <div className="space-y-1">
            <Label>رسوم التوصيل (ل.س)</Label>
            <Input
              type="number"
              min={0}
              value={form.deliveryFee}
              onChange={(e) =>
                set("deliveryFee", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div className="space-y-1">
            <Label>الحد الأدنى للطلب (ل.س)</Label>
            <Input
              type="number"
              min={0}
              value={form.minOrder}
              onChange={(e) =>
                set("minOrder", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div className="space-y-1">
            <Label>الخصم (اختياري)</Label>
            <Input
              value={form.discount ?? ""}
              onChange={(e) => set("discount", e.target.value || null)}
              placeholder="مثال: 20%"
            />
          </div>
          <div className="space-y-1">
            <Label>رقم هاتف المطعم</Label>
            <Input
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value || null)}
              placeholder="مثال: 0944 123 456"
              dir="ltr"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <ImageUpload
              value={form.image}
              onChange={(url) => set("image", url)}
              label="صورة المطعم"
            />
          </div>
          <LocationPicker
            lat={form.lat}
            lon={form.lon}
            onChange={(lat, lon) => { set("lat", lat); set("lon", lon); }}
          />
          <div className="col-span-2 space-y-1">
            <Label>الوسوم (مفصولة بفاصلة)</Label>
            <Input
              value={form.tags.join(", ")}
              onChange={(e) => {
                const raw = e.target.value;
                set("tags", raw.split(",").map((t) => t.trim()).filter(Boolean));
              }}
              placeholder="برجر, شاورما, ..."
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="isOpen"
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => set("isOpen", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Label htmlFor="isOpen">مفتوح للطلبات</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onSave(form)}
            disabled={!form.name || !form.nameAr || !form.category || !form.categoryAr || !form.phone || saving}
          >
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenuDialog({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<MenuItemForm>(emptyMenuItem);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin", "menu", restaurant.id],
    queryFn: () => api.getMenu(restaurant.id),
  });

  const createMutation = useMutation({
    mutationFn: (data: MenuItemForm) =>
      api.createMenuItem(restaurant.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setShowForm(false);
      setForm(emptyMenuItem);
      toast({ title: "تم إضافة الصنف بنجاح" });
    },
    onError: (err: Error) => {
      toast({
        title: "فشل حفظ الصنف",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ item, data }: { item: MenuItem; data: MenuItemForm }) =>
      api.updateMenuItem(item.restaurantId, item.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant.id] });
      setEditItem(null);
      toast({ title: "تم تحديث الصنف بنجاح" });
    },
    onError: (err: Error) => {
      toast({
        title: "فشل تحديث الصنف",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MenuItem) =>
      api.deleteMenuItem(item.restaurantId, item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast({ title: "تم حذف الصنف" });
    },
    onError: (err: Error) => {
      toast({
        title: "فشل حذف الصنف",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const activeForm = editItem
    ? {
        name: editItem.name,
        nameAr: editItem.nameAr,
        description: editItem.description,
        descriptionAr: editItem.descriptionAr,
        price: editItem.price,
        image: editItem.image,
        category: editItem.category,
        categoryAr: editItem.categoryAr,
        isPopular: editItem.isPopular,
      }
    : form;

  const setActiveForm = (updater: (f: MenuItemForm) => MenuItemForm) => {
    if (editItem) setEditItem((i) => i && { ...i, ...updater(i) });
    else setForm(updater);
  };

  const setField = <K extends keyof MenuItemForm>(k: K, v: MenuItemForm[K]) =>
    setActiveForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            القائمة —{" "}
            <span dir="rtl" className="font-bold">
              {restaurant.nameAr}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!showForm && !editItem && (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-fit"
            onClick={() => setShowForm(true)}
          >
            + إضافة صنف
          </Button>
        )}

        {(showForm || editItem) && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/40">
            <h3 className="font-semibold text-sm">
              {editItem ? "تعديل الصنف" : "صنف جديد"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>اسم الوجبة *</Label>
                <Input
                  dir="rtl"
                  value={activeForm.nameAr}
                  onChange={(e) => setField("nameAr", e.target.value)}
                  placeholder="مثال: شاورما دجاج"
                />
              </div>
              <div className="space-y-1">
                <Label>الفئة</Label>
                <Input
                  dir="rtl"
                  value={activeForm.categoryAr}
                  onChange={(e) => setField("categoryAr", e.target.value)}
                  placeholder="مثال: مشاوي"
                />
              </div>
              <div className="space-y-1">
                <Label>السعر (ل.س) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={activeForm.price}
                  onChange={(e) =>
                    setField("price", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>الوصف</Label>
                <Input
                  dir="rtl"
                  value={activeForm.descriptionAr}
                  onChange={(e) => setField("descriptionAr", e.target.value)}
                  placeholder="وصف مختصر للوجبة (اختياري)"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <ImageUpload
                  value={activeForm.image}
                  onChange={(url) => setField("image", url)}
                  label="صورة الوجبة (اختيارية)"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPopular"
                  checked={activeForm.isPopular}
                  onChange={(e) => setField("isPopular", e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <Label htmlFor="isPopular">صنف شائع</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  const data: MenuItemForm = {
                    ...activeForm,
                    name: activeForm.nameAr,
                    category: activeForm.categoryAr,
                    description: activeForm.descriptionAr,
                  };
                  if (editItem) {
                    updateMutation.mutate({ item: editItem, data });
                  } else {
                    createMutation.mutate(data);
                  }
                }}
                disabled={
                  createMutation.isPending ||
                  updateMutation.isPending ||
                  !activeForm.nameAr
                }
              >
                {editItem ? "تحديث" : "إنشاء"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditItem(null);
                  setForm(emptyMenuItem);
                }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">جاري تحميل القائمة...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">
            لا توجد أصناف بعد.
          </p>
        ) : (
          <div className="space-y-2 mt-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border rounded-lg p-3 bg-card"
              >
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p
                    className="text-xs text-muted-foreground"
                    dir="rtl"
                  >
                    {item.nameAr} · {item.price.toLocaleString("ar-SY")} ل.س
                  </p>
                </div>
                {item.isPopular && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex-shrink-0">
                    شائع
                  </span>
                )}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setEditItem(item);
                      setShowForm(false);
                    }}
                  >
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`حذف "${item.nameAr}"؟`))
                        deleteMutation.mutate(item);
                    }}
                  >
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function HoursDialog({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: initialHours, isLoading } = useQuery({
    queryKey: ["admin", "restaurant-hours", restaurant.id],
    queryFn: () => api.getRestaurantHours(restaurant.id),
  });

  const [hours, setHours] = useState<Omit<RestaurantHour, "id" | "restaurantId">[] | null>(null);

  const normalizeTime = (t: string) => t.slice(0, 5);
  const displayHours = hours ?? (initialHours ? initialHours.map((h) => ({
    dayOfWeek: h.dayOfWeek,
    openTime: normalizeTime(h.openTime),
    closeTime: normalizeTime(h.closeTime),
    isClosed: h.isClosed,
  })) : DAY_NAMES.map((_, i) => ({ dayOfWeek: i, openTime: "09:00", closeTime: "22:00", isClosed: false })));

  const updateHour = (dayOfWeek: number, field: string, value: unknown) => {
    setHours(displayHours.map((h) =>
      h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
    ));
  };

  const saveMutation = useMutation({
    mutationFn: (h: Omit<RestaurantHour, "id" | "restaurantId">[]) =>
      api.updateRestaurantHours(restaurant.id, h),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-hours", restaurant.id] });
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            أوقات العمل — <span dir="rtl">{restaurant.nameAr}</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : (
          <div className="space-y-3 py-2">
            {displayHours.map((h) => (
              <div key={h.dayOfWeek} className="flex items-center gap-3">
                <div className="w-20 text-sm font-medium text-right" dir="rtl">{DAY_NAMES[h.dayOfWeek]}</div>
                <input
                  type="checkbox"
                  checked={h.isClosed}
                  onChange={(e) => updateHour(h.dayOfWeek, "isClosed", e.target.checked)}
                  className="w-4 h-4 accent-red-500"
                  title="مغلق طوال اليوم"
                />
                <span className="text-xs text-muted-foreground w-12">مغلق</span>
                <Input
                  type="time"
                  value={h.openTime}
                  onChange={(e) => updateHour(h.dayOfWeek, "openTime", e.target.value)}
                  disabled={h.isClosed}
                  className="h-8 text-xs w-28"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="time"
                  value={h.closeTime}
                  onChange={(e) => updateHour(h.dayOfWeek, "closeTime", e.target.value)}
                  disabled={h.isClosed}
                  className="h-8 text-xs w-28"
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => saveMutation.mutate(displayHours)}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الأوقات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Restaurants() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editRestaurant, setEditRestaurant] = useState<Restaurant | null>(null);
  const [menuRestaurant, setMenuRestaurant] = useState<Restaurant | null>(null);
  const [hoursRestaurant, setHoursRestaurant] = useState<Restaurant | null>(null);
  const [search, setSearch] = useState("");

  const { data: restaurants = [], isLoading } = useQuery({
    queryKey: ["admin", "restaurants"],
    queryFn: api.getRestaurants,
  });

  const createMutation = useMutation({
    mutationFn: api.createRestaurant,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      setShowForm(false);
      toast({ title: "تم إضافة المطعم بنجاح" });
    },
    onError: (err: Error) => {
      toast({
        title: "فشل حفظ المطعم",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Restaurant> }) =>
      api.updateRestaurant(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      setEditRestaurant(null);
      toast({ title: "تم تحديث المطعم بنجاح" });
    },
    onError: (err: Error) => {
      toast({
        title: "فشل تحديث المطعم",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRestaurant,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast({ title: "تم حذف المطعم" });
    },
    onError: (err: Error) => {
      toast({
        title: "فشل حذف المطعم",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  const filtered = restaurants.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.nameAr.includes(search),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المطاعم</h1>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setShowForm(true)}
        >
          + إضافة مطعم
        </Button>
      </div>

      <Input
        type="search"
        placeholder="ابحث في المطاعم..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <p className="text-muted-foreground">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">لا توجد مطاعم.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-right px-4 py-3 font-medium">الاسم</th>
                <th className="text-right px-4 py-3 font-medium">التصنيف</th>
                <th className="text-right px-4 py-3 font-medium">التقييم</th>
                <th className="text-right px-4 py-3 font-medium">تقييم المندوب</th>
                <th className="text-right px-4 py-3 font-medium">الرسوم (ل.س)</th>
                <th className="text-right px-4 py-3 font-medium">الطلبات</th>
                <th className="text-right px-4 py-3 font-medium">الحالة</th>
                <th className="text-right px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {r.nameAr}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{r.category}</p>
                    <p className="text-xs text-muted-foreground" dir="rtl">
                      {r.categoryAr}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    ⭐ {r.rating.toFixed(1)}
                    <span className="text-xs text-muted-foreground mr-1">
                      ({r.reviewCount})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.avgCourierRating != null ? (
                      <span className="flex items-center gap-1 text-xs">
                        {[...Array(5)].map((_, i) => (
                          <span
                            key={i}
                            className={i < Math.floor(r.avgCourierRating!) ? "text-yellow-400" : "text-gray-300"}
                          >★</span>
                        ))}
                        <span className="mr-1 text-muted-foreground">{(r.avgCourierRating as number).toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.deliveryFee === 0
                      ? "مجاني"
                      : `${r.deliveryFee.toLocaleString("ar-SY")} ل.س`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-orange-600">
                      {Number(r.ordersCount ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.isOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {r.isOpen ? "مفتوح" : "مغلق"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setMenuRestaurant(r)}
                      >
                        القائمة
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setHoursRestaurant(r)}
                      >
                        الأوقات
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditRestaurant(r)}
                      >
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `حذف "${r.nameAr}"؟ سيتم حذف جميع أصناف القائمة أيضاً.`,
                            )
                          ) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                      >
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <RestaurantFormDialog
          open
          onClose={() => setShowForm(false)}
          initial={emptyRestaurant}
          onSave={(data) => createMutation.mutate(data)}
          saving={createMutation.isPending}
        />
      )}

      {editRestaurant && (
        <RestaurantFormDialog
          open
          onClose={() => setEditRestaurant(null)}
          initial={editRestaurant}
          onSave={(data) =>
            updateMutation.mutate({ id: editRestaurant.id, data })
          }
          saving={updateMutation.isPending}
        />
      )}

      {menuRestaurant && (
        <MenuDialog
          restaurant={menuRestaurant}
          onClose={() => setMenuRestaurant(null)}
        />
      )}

      {hoursRestaurant && (
        <HoursDialog
          restaurant={hoursRestaurant}
          onClose={() => setHoursRestaurant(null)}
        />
      )}
    </div>
  );
}