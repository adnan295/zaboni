import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CourierSubRow, CourierSubRecord, CourierSubPlan, SubscriptionPeriod, PaymentInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ImageUpload } from "@/components/ImageUpload";

const STATUS_LABEL: Record<string, string> = {
  paid: "مدفوع",
  waived: "معفى",
  pending: "غير مدفوع",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  waived: "secondary",
  pending: "destructive",
};

const PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  weekly: "أسبوعي",
  monthly: "شهري",
  yearly: "سنوي",
};

const PERIOD_OPTIONS: SubscriptionPeriod[] = ["weekly", "monthly", "yearly"];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" });
}

function PlanManagerDialog({
  open,
  plans,
  onClose,
}: {
  open: boolean;
  plans: CourierSubPlan[] | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<SubscriptionPeriod>("monthly");
  const [price, setPrice] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setPeriod("monthly");
    setPrice("0");
    setEditingId(null);
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "courier-sub-plans"] });

  const createMut = useMutation({
    mutationFn: api.createCourierSubPlan,
    onSuccess: () => {
      invalidate();
      toast({ title: "تم إنشاء الباقة" });
      resetForm();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; period: SubscriptionPeriod; price: number; isActive: boolean }> }) =>
      api.updateCourierSubPlan(id, data),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم تحديث الباقة" });
      resetForm();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: api.deleteCourierSubPlan,
    onSuccess: () => {
      invalidate();
      toast({ title: "تم حذف الباقة" });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const startEdit = (plan: CourierSubPlan) => {
    setEditingId(plan.id);
    setName(plan.name);
    setPeriod(plan.period);
    setPrice(String(plan.price));
  };

  const handleSubmit = () => {
    const data = { name: name.trim(), period, price: parseInt(price, 10) || 0 };
    if (!data.name) {
      toast({ title: "أدخل اسم الباقة", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, data });
    } else {
      createMut.mutate(data);
    }
  };

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">إدارة باقات الاشتراك</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="border rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1 col-span-3 sm:col-span-1">
                <Label className="text-right block text-xs">اسم الباقة</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="text-right" dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label className="text-right block text-xs">المدة</Label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as SubscriptionPeriod)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-right"
                >
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-right block text-xs">السعر (ل.س)</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="text-right"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {editingId && (
                <Button variant="outline" size="sm" onClick={resetForm}>إلغاء التعديل</Button>
              )}
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
              >
                {editingId ? "حفظ التعديل" : "إضافة باقة"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {!plans?.length ? (
              <div className="text-center text-muted-foreground text-sm py-4">لا توجد باقات بعد</div>
            ) : (
              plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between border rounded-lg p-2.5 text-sm">
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(plan)}>تعديل</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateMut.mutate({ id: plan.id, data: { isActive: !plan.isActive } })
                      }
                    >
                      {plan.isActive ? "تعطيل" : "تفعيل"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`حذف باقة ${plan.name}؟`)) deleteMut.mutate(plan.id);
                      }}
                    >
                      حذف
                    </Button>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold flex items-center gap-2 justify-end">
                      {!plan.isActive && <Badge variant="outline">معطلة</Badge>}
                      {plan.name}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {PERIOD_LABEL[plan.period]} · {plan.price.toLocaleString("ar-SY")} ل.س
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantDialog({
  open,
  courier,
  plans,
  onClose,
}: {
  open: boolean;
  courier: CourierSubRow | null;
  plans: CourierSubPlan[] | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activePlans = (plans ?? []).filter((p) => p.isActive);
  const [planId, setPlanId] = useState<string>(activePlans[0]?.id ?? "");
  const [gifted, setGifted] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setPlanId(activePlans[0]?.id ?? "");
      setGifted(false);
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedPlan = activePlans.find((p) => p.id === planId);

  const mut = useMutation({
    mutationFn: api.createCourierSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courier-subscriptions"] });
      toast({ title: "تم منح الاشتراك بنجاح" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  if (!open || !courier) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">منح اشتراك — {courier.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-right block">الباقة</Label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-right"
            >
              {activePlans.length === 0 && <option value="">لا توجد باقات فعّالة</option>}
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {PERIOD_LABEL[p.period]} — {p.price.toLocaleString("ar-SY")} ل.س
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGifted(false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                !gifted ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover:bg-muted"
              }`}
            >
              مدفوع ({(selectedPlan?.price ?? 0).toLocaleString("ar-SY")} ل.س)
            </button>
            <button
              onClick={() => setGifted(true)}
              className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                gifted ? "bg-secondary text-secondary-foreground border-secondary" : "bg-background text-foreground border-input hover:bg-muted"
              }`}
            >
              هدية مجانية
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-right block">ملاحظة (اختياري)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-right"
              placeholder="ملاحظة..."
              dir="rtl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() =>
              mut.mutate({
                courierId: courier.courierId,
                planId,
                gifted,
                note: note || null,
              })
            }
            disabled={mut.isPending || !planId}
          >
            {mut.isPending ? "جاري المعالجة..." : "تأكيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({
  open,
  subscriptionId,
  courierName,
  onClose,
}: {
  open: boolean;
  subscriptionId: string | null;
  courierName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState("30");

  const mut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { days: number } }) =>
      api.extendCourierSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courier-subscriptions"] });
      toast({ title: "تم تمديد الاشتراك" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  if (!open || !subscriptionId) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">تمديد اشتراك — {courierName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-right block">تمديد بعدد أيام</Label>
            <Input
              type="number"
              min={1}
              max={400}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="text-right"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() =>
              mut.mutate({ id: subscriptionId, data: { days: parseInt(days, 10) || 1 } })
            }
            disabled={mut.isPending}
          >
            {mut.isPending ? "جاري التمديد..." : "تمديد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  open,
  courierId,
  courierName,
  onClose,
}: {
  open: boolean;
  courierId: string | null;
  courierName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "courier-sub-history", courierId],
    queryFn: () => api.getCourierSubscriptionHistory(courierId!),
    enabled: !!courierId && open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">سجل اشتراكات — {courierName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : !data?.length ? (
            <div className="py-8 text-center text-muted-foreground">لا يوجد سجل اشتراكات</div>
          ) : (
            <div className="space-y-3">
              {data.map((r: CourierSubRecord) => (
                <div key={r.id} className="border rounded-lg p-3 text-sm text-right space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                      {STATUS_LABEL[r.status]}
                      {r.gifted ? " (هدية)" : ""}
                    </Badge>
                    <span className="font-semibold">{r.planName} — {PERIOD_LABEL[r.planPeriod] ?? r.planPeriod}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {fmtDate(r.startsAt)} ← {fmtDate(r.endsAt)}
                  </div>
                  <div>{r.amount.toLocaleString("ar-SY")} ل.س</div>
                  {r.note && <div className="text-muted-foreground">{r.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentInfoCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [accountImage, setAccountImage] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery<PaymentInfo>({
    queryKey: ["admin", "payment-info"],
    queryFn: api.getPaymentInfo,
  });

  useEffect(() => {
    if (data) {
      setAccountImage(data.accountImage ?? "");
      setQrImage(data.qrImage ?? "");
      setDirty(false);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      api.updatePaymentInfo({
        accountImage: accountImage || null,
        qrImage: qrImage || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "payment-info"] });
      setDirty(false);
      toast({ title: "تم حفظ معلومات الدفع" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-base">معلومات حساب الدفع</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            تظهر هذه الصور للسائق على شاشة الدفع لمعرفة وين يحوّل المبلغ
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !dirty}
        >
          {mut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ImageUpload
          label="صورة تفاصيل الحساب البنكي / المحفظة"
          value={accountImage}
          onChange={(v) => { setAccountImage(v); setDirty(true); }}
        />
        <ImageUpload
          label="صورة QR Code للدفع"
          value={qrImage}
          onChange={(v) => { setQrImage(v); setDirty(true); }}
        />
      </div>
    </div>
  );
}

export default function Subscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [planManagerOpen, setPlanManagerOpen] = useState(false);
  const [grantCourier, setGrantCourier] = useState<CourierSubRow | null>(null);
  const [extendSub, setExtendSub] = useState<{ id: string; name: string } | null>(null);
  const [historyCourier, setHistoryCourier] = useState<{ id: string; name: string } | null>(null);

  const { data: couriers, isLoading } = useQuery({
    queryKey: ["admin", "courier-subscriptions"],
    queryFn: api.getCourierSubscriptions,
    refetchInterval: 30_000,
  });

  const { data: plans } = useQuery({
    queryKey: ["admin", "courier-sub-plans"],
    queryFn: api.getCourierSubPlans,
  });

  const cancelMut = useMutation({
    mutationFn: api.cancelCourierSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courier-subscriptions"] });
      toast({ title: "تم إلغاء الاشتراك" });
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const activeCount = couriers?.filter((c) => c.isActive).length ?? 0;
  const expiringSoon = couriers?.filter((c) => c.isActive && (c.daysLeft ?? 99) <= 5).length ?? 0;
  const inactiveCount = couriers?.filter((c) => !c.isActive).length ?? 0;
  const totalRevenue = couriers?.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">اشتراكات السائقين</h1>
          <p className="text-muted-foreground text-sm mt-1">رسوم العمل على المنصة</p>
        </div>
        <Button variant="outline" onClick={() => setPlanManagerOpen(true)}>
          💰 إدارة الباقات
        </Button>
      </div>

      <PaymentInfoCard />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-primary">{activeCount}</div>
          <div className="text-sm text-muted-foreground mt-1">مشترك نشط</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-yellow-600">{expiringSoon}</div>
          <div className="text-sm text-muted-foreground mt-1">ينتهي قريباً (≤5 أيام)</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-destructive">{inactiveCount}</div>
          <div className="text-sm text-muted-foreground mt-1">غير مشترك</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-green-600">
            {totalRevenue.toLocaleString("ar-SY")} ل.س
          </div>
          <div className="text-sm text-muted-foreground mt-1">إجمالي الاشتراكات</div>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
        ) : !couriers?.length ? (
          <div className="p-12 text-center text-muted-foreground">لا يوجد سائقون مسجلون</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">السائق</TableHead>
                <TableHead className="text-right">الباقة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                <TableHead className="text-right">الأيام المتبقية</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {couriers.map((courier) => (
                <TableRow key={courier.courierId} className={!courier.isActive ? "opacity-60" : undefined}>
                  <TableCell className="text-right">
                    <div className="font-medium">{courier.name || "—"}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{courier.phone}</div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {courier.planName
                      ? `${courier.planName} — ${PERIOD_LABEL[courier.planPeriod as SubscriptionPeriod] ?? courier.planPeriod}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {courier.isActive ? (
                      <Badge variant={STATUS_VARIANT[courier.status] ?? "outline"}>
                        {STATUS_LABEL[courier.status]}
                        {courier.gifted ? " (هدية)" : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline">غير مشترك</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {fmtDate(courier.endsAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {courier.isActive && courier.daysLeft !== null ? (
                      <span className={`font-semibold ${courier.daysLeft <= 5 ? "text-destructive" : courier.daysLeft <= 14 ? "text-yellow-600" : "text-green-600"}`}>
                        {courier.daysLeft} يوم
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <Button
                        size="sm"
                        onClick={() => setGrantCourier(courier)}
                      >
                        {courier.isActive ? "تجديد" : "منح"}
                      </Button>
                      {courier.subscriptionId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExtendSub({ id: courier.subscriptionId!, name: courier.name })
                          }
                        >
                          تمديد
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setHistoryCourier({ id: courier.courierId, name: courier.name })
                        }
                      >
                        السجل
                      </Button>
                      {courier.subscriptionId && courier.isActive && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(`إلغاء اشتراك ${courier.name}؟`)) {
                              cancelMut.mutate(courier.subscriptionId!);
                            }
                          }}
                          disabled={cancelMut.isPending}
                        >
                          إلغاء
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <PlanManagerDialog
        open={planManagerOpen}
        plans={plans}
        onClose={() => setPlanManagerOpen(false)}
      />

      <GrantDialog
        open={!!grantCourier}
        courier={grantCourier}
        plans={plans}
        onClose={() => setGrantCourier(null)}
      />

      <ExtendDialog
        open={!!extendSub}
        subscriptionId={extendSub?.id ?? null}
        courierName={extendSub?.name ?? ""}
        onClose={() => setExtendSub(null)}
      />

      <HistoryDialog
        open={!!historyCourier}
        courierId={historyCourier?.id ?? null}
        courierName={historyCourier?.name ?? ""}
        onClose={() => setHistoryCourier(null)}
      />
    </div>
  );
}
