import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type MenuItem, type OptionGroup } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ImageUpload } from "@/components/ImageUpload";
import { Trash2, Plus } from "lucide-react";

function OptionGroupsDialog({ item, open, onClose }: { item: MenuItem | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newGroupName, setNewGroupName] = useState("");
  const [newOpts, setNewOpts] = useState<Record<string, { nameAr: string; extraPrice: string }>>({});
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editOptId, setEditOptId] = useState<string | null>(null);
  const [editOptFields, setEditOptFields] = useState<{ nameAr: string; extraPrice: string }>({ nameAr: "", extraPrice: "" });

  const { data: groups = [], isLoading } = useQuery<OptionGroup[]>({
    queryKey: ["option-groups", item?.id],
    queryFn: () => api.getOptionGroups(item!.id),
    enabled: open && !!item,
  });

  const addGroupMut = useMutation({
    mutationFn: (nameAr: string) => api.createOptionGroup(item!.id, { nameAr }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["option-groups", item?.id] }); setNewGroupName(""); },
    onError: () => toast({ variant: "destructive", title: "فشل إضافة المجموعة" }),
  });

  const updateGroupMut = useMutation({
    mutationFn: ({ groupId, nameAr }: { groupId: string; nameAr: string }) =>
      api.updateOptionGroup(item!.id, groupId, { nameAr }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["option-groups", item?.id] }); setEditGroupId(null); },
    onError: () => toast({ variant: "destructive", title: "فشل تعديل المجموعة" }),
  });

  const delGroupMut = useMutation({
    mutationFn: (groupId: string) => api.deleteOptionGroup(item!.id, groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["option-groups", item?.id] }),
    onError: () => toast({ variant: "destructive", title: "فشل الحذف" }),
  });

  const addOptMut = useMutation({
    mutationFn: ({ groupId, nameAr, extraPrice }: { groupId: string; nameAr: string; extraPrice: number }) =>
      api.createOption(item!.id, groupId, { nameAr, extraPrice }),
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: ["option-groups", item?.id] });
      setNewOpts(prev => { const n = { ...prev }; delete n[groupId]; return n; });
    },
    onError: () => toast({ variant: "destructive", title: "فشل إضافة الخيار" }),
  });

  const updateOptMut = useMutation({
    mutationFn: ({ groupId, optionId, nameAr, extraPrice }: { groupId: string; optionId: string; nameAr: string; extraPrice: number }) =>
      api.updateOption(item!.id, groupId, optionId, { nameAr, extraPrice }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["option-groups", item?.id] }); setEditOptId(null); },
    onError: () => toast({ variant: "destructive", title: "فشل تعديل الخيار" }),
  });

  const delOptMut = useMutation({
    mutationFn: ({ groupId, optionId }: { groupId: string; optionId: string }) =>
      api.deleteOption(item!.id, groupId, optionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["option-groups", item?.id] }),
    onError: () => toast({ variant: "destructive", title: "فشل الحذف" }),
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافات: {item.nameAr}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-6 text-muted-foreground text-sm">جاري التحميل...</p>
        ) : (
          <div className="space-y-4">
            {groups.length === 0 && (
              <p className="text-center py-4 text-muted-foreground text-sm">لا توجد مجموعات إضافات بعد</p>
            )}

            {groups.map((group) => {
              const newOpt = newOpts[group.id] ?? { nameAr: "", extraPrice: "" };
              const isEditingGroup = editGroupId === group.id;
              return (
                <div key={group.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {isEditingGroup ? (
                      <>
                        <Input
                          className="h-7 text-sm flex-1 font-semibold"
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editGroupName.trim()) updateGroupMut.mutate({ groupId: group.id, nameAr: editGroupName.trim() });
                            if (e.key === "Escape") setEditGroupId(null);
                          }}
                          autoFocus
                        />
                        <Button size="sm" className="h-7 px-2" disabled={!editGroupName.trim() || updateGroupMut.isPending}
                          onClick={() => updateGroupMut.mutate({ groupId: group.id, nameAr: editGroupName.trim() })}>
                          حفظ
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditGroupId(null)}>إلغاء</Button>
                      </>
                    ) : (
                      <>
                        <p
                          className="font-semibold text-sm flex-1 cursor-pointer hover:text-primary"
                          onClick={() => { setEditGroupId(group.id); setEditGroupName(group.nameAr); }}
                          title="انقر للتعديل"
                        >
                          {group.nameAr}
                        </p>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => delGroupMut.mutate(group.id)} disabled={delGroupMut.isPending}>
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="space-y-1 pr-2">
                    {group.options.map((opt) => {
                      const isEditingOpt = editOptId === opt.id;
                      return (
                        <div key={opt.id}>
                          {isEditingOpt ? (
                            <div className="flex gap-2 items-center">
                              <Input
                                className="h-7 text-sm flex-1"
                                value={editOptFields.nameAr}
                                onChange={(e) => setEditOptFields(p => ({ ...p, nameAr: e.target.value }))}
                                autoFocus
                              />
                              <Input
                                type="number"
                                min="0"
                                className="h-7 text-sm w-24"
                                value={editOptFields.extraPrice}
                                onChange={(e) => setEditOptFields(p => ({ ...p, extraPrice: e.target.value }))}
                              />
                              <Button size="sm" className="h-7 px-2 shrink-0"
                                disabled={!editOptFields.nameAr.trim() || updateOptMut.isPending}
                                onClick={() => updateOptMut.mutate({ groupId: group.id, optionId: opt.id, nameAr: editOptFields.nameAr.trim(), extraPrice: parseFloat(editOptFields.extraPrice) || 0 })}>
                                حفظ
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => setEditOptId(null)}>إلغاء</Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-sm group/opt">
                              <span
                                className="flex-1 cursor-pointer hover:text-primary"
                                onClick={() => { setEditOptId(opt.id); setEditOptFields({ nameAr: opt.nameAr, extraPrice: String(opt.extraPrice) }); }}
                                title="انقر للتعديل"
                              >
                                {opt.nameAr}{opt.extraPrice > 0 ? ` (+${opt.extraPrice} ل.س)` : ""}
                              </span>
                              <Button size="icon" variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover/opt:opacity-100"
                                onClick={() => delOptMut.mutate({ groupId: group.id, optionId: opt.id })}
                                disabled={delOptMut.isPending}>
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 items-center pt-1">
                    <Input
                      placeholder="اسم الخيار"
                      className="h-8 text-sm flex-1"
                      value={newOpt.nameAr}
                      onChange={(e) => setNewOpts((prev) => ({ ...prev, [group.id]: { ...newOpt, nameAr: e.target.value } }))}
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="سعر إضافي"
                      className="h-8 text-sm w-28"
                      value={newOpt.extraPrice}
                      onChange={(e) => setNewOpts((prev) => ({ ...prev, [group.id]: { ...newOpt, extraPrice: e.target.value } }))}
                    />
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={!newOpt.nameAr.trim() || addOptMut.isPending}
                      onClick={() => addOptMut.mutate({ groupId: group.id, nameAr: newOpt.nameAr.trim(), extraPrice: parseFloat(newOpt.extraPrice) || 0 })}
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 items-center border-t border-border pt-3">
              <Input
                placeholder="اسم المجموعة الجديدة (مثال: الحجم، الإضافات)"
                className="h-9 text-sm flex-1"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!newGroupName.trim() || addGroupMut.isPending}
                onClick={() => addGroupMut.mutate(newGroupName.trim())}
              >
                إضافة مجموعة
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyItem: Omit<MenuItem, "id" | "restaurantId"> = {
  name: "", nameAr: "", price: 0, category: "", categoryAr: "",
  description: null, descriptionAr: null, image: "", isPopular: false,
  subcategory: null, subcategoryAr: null, isAvailable: true,
  isDeal: false, dealPrice: null, dealDiscountPercent: null, dealExpiresAt: null,
};

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("ar-SY", { dateStyle: "short", timeStyle: "short" });
}

export default function Menu() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editItem, setEditItem] = useState<Partial<MenuItem> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [optGroupItem, setOptGroupItem] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState("");
  const [dealPriceInput, setDealPriceInput] = useState<Record<string, string>>({});
  const [dealExpiryInput, setDealExpiryInput] = useState<Record<string, string>>({});
  const [dealMode, setDealMode] = useState<Record<string, "price" | "percent">>({});
  const [dealPercentInput, setDealPercentInput] = useState<Record<string, string>>({});

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
    mutationFn: ({ id, isDeal, dealPrice, dealExpiresAt, dealDiscountPercent }: { id: string; isDeal: boolean; dealPrice?: number | null; dealExpiresAt?: string | null; dealDiscountPercent?: number | null }) =>
      api.updateItemDeal(id, isDeal, dealPrice, dealExpiresAt, dealDiscountPercent),
    onMutate: async ({ id, isDeal, dealPrice, dealExpiresAt }) => {
      await qc.cancelQueries({ queryKey: ["portal-menu"] });
      const prev = qc.getQueryData<MenuItem[]>(["portal-menu"]);
      qc.setQueryData<MenuItem[]>(["portal-menu"], old =>
        old?.map(it => it.id === id ? { ...it, isDeal, dealPrice: isDeal ? (dealPrice ?? null) : null, dealExpiresAt: isDeal ? (dealExpiresAt ?? null) : null } : it) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["portal-menu"], ctx.prev);
      toast({ variant: "destructive", title: "فشل تحديث العرض" });
    },
    onSuccess: (_data, { id }) => {
      setDealPriceInput(prev => { const next = { ...prev }; delete next[id]; return next; });
      setDealExpiryInput(prev => { const next = { ...prev }; delete next[id]; return next; });
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
                      {item.dealExpiresAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ⏱ ينتهي: {formatExpiry(item.dealExpiresAt)}
                        </p>
                      )}
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
                        {item.isDeal && item.dealExpiresAt && (
                          <p className="text-xs text-muted-foreground mt-1">⏱ ينتهي: {formatExpiry(item.dealExpiresAt)}</p>
                        )}
                      </div>
                    </div>

                    {!item.isDeal && (
                      <div className="mt-3 space-y-2">
                        <div className="flex gap-1 rounded-lg overflow-hidden border border-orange-200 self-start">
                          <button
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${(dealMode[item.id] ?? "price") === "price" ? "bg-orange-500 text-white" : "bg-transparent text-orange-600 hover:bg-orange-50"}`}
                            onClick={() => setDealMode(prev => ({ ...prev, [item.id]: "price" }))}
                          >
                            سعر ثابت
                          </button>
                          <button
                            className={`px-3 py-1 text-xs font-semibold transition-colors ${dealMode[item.id] === "percent" ? "bg-orange-500 text-white" : "bg-transparent text-orange-600 hover:bg-orange-50"}`}
                            onClick={() => setDealMode(prev => ({ ...prev, [item.id]: "percent" }))}
                          >
                            نسبة خصم %
                          </button>
                        </div>
                        {(dealMode[item.id] ?? "price") === "price" ? (
                          <div className="flex gap-2 items-center">
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
                                const expiryLocal = dealExpiryInput[item.id];
                                const dealExpiresAt = expiryLocal ? new Date(expiryLocal).toISOString() : null;
                                dealMutation.mutate({ id: item.id, isDeal: true, dealPrice: price, dealExpiresAt });
                              }}
                            >
                              تفعيل عرض 🔥
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <div className="relative flex-1">
                              <Input
                                type="number"
                                min="1"
                                max="99"
                                placeholder="نسبة الخصم"
                                className="h-8 text-sm pl-8"
                                value={dealPercentInput[item.id] ?? ""}
                                onChange={e => setDealPercentInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                              />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-bold">%</span>
                            </div>
                            {dealPercentInput[item.id] && parseFloat(dealPercentInput[item.id]) > 0 && parseFloat(dealPercentInput[item.id]) < 100 && (
                              <span className="text-xs text-orange-600 font-semibold shrink-0">
                                → {Math.round(item.price * (1 - parseFloat(dealPercentInput[item.id]) / 100))} ل.س
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-300 text-orange-600 hover:bg-orange-50 shrink-0"
                              disabled={dealMutation.isPending || !dealPercentInput[item.id]}
                              onClick={() => {
                                const pct = parseFloat(dealPercentInput[item.id] ?? "");
                                if (!pct || pct <= 0 || pct >= 100) return;
                                const expiryLocal = dealExpiryInput[item.id];
                                const dealExpiresAt = expiryLocal ? new Date(expiryLocal).toISOString() : null;
                                dealMutation.mutate({ id: item.id, isDeal: true, dealDiscountPercent: pct, dealExpiresAt });
                              }}
                            >
                              تفعيل عرض 🔥
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Input
                            type="datetime-local"
                            className="h-8 text-xs"
                            value={dealExpiryInput[item.id] ?? ""}
                            onChange={e => setDealExpiryInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                          />
                          <span className="text-xs text-muted-foreground shrink-0">انتهاء (اختياري)</span>
                        </div>
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
                      <Button size="sm" variant="outline" onClick={() => setOptGroupItem(item)} title="إدارة الإضافات">
                        <Plus size={14} className="ml-1" />
                        إضافات
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

      <OptionGroupsDialog
        item={optGroupItem}
        open={!!optGroupItem}
        onClose={() => setOptGroupItem(null)}
      />

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
