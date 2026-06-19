import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type MenuItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ImageUpload } from "@/components/ImageUpload";

const emptyItem: Omit<MenuItem, "id" | "restaurantId"> = {
  name: "", nameAr: "", price: 0, category: "", categoryAr: "",
  description: null, descriptionAr: null, image: "", isPopular: false,
  subcategory: null, subcategoryAr: null, isAvailable: true,
  isDeal: false, dealPrice: null,
};

export default function Menu() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dealPriceInput, setDealPriceInput] = useState<Record<string, string>>({});

  const { data: items = [], isLoading } = useQuery({ queryKey: ["portal-menu"], queryFn: api.getMenu });

  const saveMutation = useMutation({
    mutationFn: (item: Partial<MenuItem>) =>
      item.id ? api.updateMenuItem(item.id, item) : api.createMenuItem(item as Omit<MenuItem, "id" | "restaurantId">),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-menu"] });
      qc.invalidateQueries({ queryKey: ["portal-stats"] });
      setEditItem(null);
      toast({ title: "تم الحفظ بنجاح" });
    },
    onError: (e) => toast({ variant: "destructive", title: "خطأ", description: String(e instanceof Error ? e.message : e) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMenuItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-menu"] });
      qc.invalidateQueries({ queryKey: ["portal-stats"] });
      setDeleteId(null);
      toast({ title: "تم الحذف" });
    },
  });

  const availabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.updateItemAvailability(id, isAvailable),
    onMutate: async ({ id, isAvailable }) => {
      await qc.cancelQueries({ queryKey: ["portal-menu"] });
      const prev = qc.getQueryData<MenuItem[]>(["portal-menu"]);
      qc.setQueryData<MenuItem[]>(["portal-menu"], old =>
        old?.map(it => it.id === id ? { ...it, isAvailable } : it) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["portal-menu"], ctx.prev);
      toast({ variant: "destructive", title: "فشل تحديث التوفر" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["portal-menu"] }),
  });

  const dealMutation = useMutation({
    mutationFn: ({ id, isDeal, dealPrice }: { id: string; isDeal: boolean; dealPrice?: number | null }) =>
      api.updateItemDeal(id, isDeal, dealPrice),
    onMutate: async ({ id, isDeal, dealPrice }) => {
      await qc.cancelQueries({ queryKey: ["portal-menu"] });
      const prev = qc.getQueryData<MenuItem[]>(["portal-menu"]);
      qc.setQueryData<MenuItem[]>(["portal-menu"], old =>
        old?.map(it => it.id === id ? { ...it, isDeal, dealPrice: isDeal ? (dealPrice ?? null) : null } : it) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["portal-menu"], ctx.prev);
      toast({ variant: "destructive", title: "فشل تحديث العرض" });
    },
    onSuccess: (_data, { id }) => {
      setDealPriceInput(prev => { const next = { ...prev }; delete next[id]; return next; });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["portal-menu"] }),
  });

  const filtered = items.filter(i =>
    i.nameAr.includes(search) || i.name.toLowerCase().includes(search.toLowerCase()) || i.category.includes(search)
  );

  const activeDeals = filtered.filter(i => i.isDeal);
  const grouped = filtered.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const key = item.categoryAr || item.category || "أخرى";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <Input
          placeholder="بحث في القائمة..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => setEditItem({ ...emptyItem })}>+ إضافة صنف</Button>
      </div>

      {activeDeals.length > 0 && (
        <div>
          <h3 className="font-semibold text-base mb-2 text-orange-600">🔥 العروض النشطة ({activeDeals.length})</h3>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeDeals.map(item => (
              <Card key={item.id} className="flex flex-col border-orange-200 bg-orange-50/50">
                <CardContent className="pt-4 flex flex-col flex-1">
                  <div className="flex items-start gap-3">
                    {item.image && (
                      <img src={item.image} alt={item.nameAr} className="w-16 h-16 rounded-lg object-cover shrink-0 border" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{item.nameAr}</p>
                      <p className="text-xs text-muted-foreground">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm line-through text-muted-foreground">{item.price} ل.س</span>
                        <span className="font-bold text-orange-600">{item.dealPrice} ل.س</span>
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">عرض 🔥</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 border-red-200 text-red-600 hover:bg-red-50"
                    disabled={dealMutation.isPending}
                    onClick={() => dealMutation.mutate({ id: item.id, isDeal: false })}
                  >
                    إلغاء العرض
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {Object.entries(grouped).length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">لا توجد أصناف. ابدأ بإضافة الأول!</div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <h3 className="font-semibold text-base mb-2 text-muted-foreground">{cat}</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {catItems.map(item => (
                <Card key={item.id} className={`flex flex-col transition-opacity ${item.isAvailable ? "" : "opacity-60"} ${item.isDeal ? "border-orange-200" : ""}`}>
                  <CardContent className="pt-4 flex flex-col flex-1">
                    <div className="flex items-start gap-3">
                      {item.image && (
                        <img src={item.image} alt={item.nameAr} className="w-16 h-16 rounded-lg object-cover shrink-0 border" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{item.nameAr}</p>
                          {item.isAvailable ? (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">متوفر</span>
                          ) : (
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">نفد</span>
                          )}
                          {item.isDeal && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">🔥 عرض</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.name}</p>
                        {item.descriptionAr && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.descriptionAr}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          {item.isDeal ? (
                            <>
                              <span className="text-sm line-through text-muted-foreground">{item.price} ل.س</span>
                              <span className="font-bold text-orange-600">{item.dealPrice} ل.س</span>
                            </>
                          ) : (
                            <span className="font-bold text-primary">{item.price} ل.س</span>
                          )}
                          {item.isPopular && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">🔥 شائع</span>}
                        </div>
                      </div>
                    </div>

                    {!item.isDeal && (
                      <div className="mt-3 flex gap-2 items-center">
                        <Input
                          type="number"
                          min="0"
                          placeholder="سعر العرض"
                          className="h-8 text-sm"
                          value={dealPriceInput[item.id] ?? ""}
                          onChange={e => setDealPriceInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-300 text-orange-600 hover:bg-orange-50 shrink-0"
                          disabled={dealMutation.isPending || !dealPriceInput[item.id]}
                          onClick={() => {
                            const price = parseFloat(dealPriceInput[item.id] ?? "");
                            if (!price || price <= 0) return;
                            dealMutation.mutate({ id: item.id, isDeal: true, dealPrice: price });
                          }}
                        >
                          تفعيل عرض 🔥
                        </Button>
                      </div>
                    )}

                    {item.isDeal && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 border-red-200 text-red-600 hover:bg-red-50"
                        disabled={dealMutation.isPending}
                        onClick={() => dealMutation.mutate({ id: item.id, isDeal: false })}
                      >
                        إلغاء العرض
                      </Button>
                    )}

                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant={item.isAvailable ? "outline" : "default"}
                        className={`flex-1 ${item.isAvailable ? "border-red-200 text-red-600 hover:bg-red-50" : "bg-green-600 hover:bg-green-700 text-white"}`}
                        disabled={availabilityMutation.isPending}
                        onClick={() => availabilityMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                      >
                        {item.isAvailable ? "تعيين كـ نفد" : "تعيين كـ متوفر"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditItem({ ...item })}>تعديل</Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleteId(item.id)}>حذف</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? "تعديل الصنف" : "إضافة صنف جديد"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الاسم بالعربية *</Label>
                <Input value={editItem.nameAr ?? ""} onChange={e => setEditItem(p => ({ ...p!, nameAr: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>الاسم بالإنجليزية</Label>
                <Input dir="ltr" value={editItem.name ?? ""} onChange={e => setEditItem(p => ({ ...p!, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>التصنيف بالعربية</Label>
                <Input value={editItem.categoryAr ?? ""} onChange={e => setEditItem(p => ({ ...p!, categoryAr: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>التصنيف بالإنجليزية</Label>
                <Input dir="ltr" value={editItem.category ?? ""} onChange={e => setEditItem(p => ({ ...p!, category: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>السعر (ل.س) *</Label>
                <Input type="number" min="0" value={editItem.price ?? 0} onChange={e => setEditItem(p => ({ ...p!, price: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="col-span-2">
                <ImageUpload
                  label="الصورة"
                  value={editItem.image ?? ""}
                  onChange={url => setEditItem(p => ({ ...p!, image: url }))}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>الوصف بالعربية</Label>
                <Input value={editItem.descriptionAr ?? ""} onChange={e => setEditItem(p => ({ ...p!, descriptionAr: e.target.value }))} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="popular" checked={!!editItem.isPopular} onChange={e => setEditItem(p => ({ ...p!, isPopular: e.target.checked }))} />
                <Label htmlFor="popular">صنف شائع (🔥)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>إلغاء</Button>
            <Button onClick={() => editItem && saveMutation.mutate(editItem)} disabled={saveMutation.isPending || !editItem?.nameAr}>
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا الصنف؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
