import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CourierSubRow, CourierSubRecord, CourierSubPlans } from "@/lib/api";
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

const VEHICLE_LABEL: Record<string, string> = {
  bicycle: "دراجة هوائية 🚲",
  motorcycle: "دراجة نارية 🏍️",
  car: "سيارة 🚗",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-SY", { year: "numeric", month: "short", day: "numeric" });
}

function PricingDialog({
  open,
  plans,
  onClose,
}: {
  open: boolean;
  plans: CourierSubPlans | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bicycle, setBicycle] = useState(String(plans?.bicycle ?? 0));
  const [motorcycle, setMotorcycle] = useState(String(plans?.motorcycle ?? 0));
  const [car, setCar] = useState(String(plans?.car ?? 0));

  const mut = useMutation({
    mutationFn: api.updateCourierSubPlans,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "courier-sub-plans"] });
      toast({ title: "تم تحديث الأسعار" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">أسعار الاشتراك الشهري</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {(
            [
              { label: "دراجة هوائية 🚲", value: bicycle, set: setBicycle },
              { label: "دراجة نارية 🏍️", value: motorcycle, set: setMotorcycle },
              { label: "سيارة 🚗", value: car, set: setCar },
            ] as { label: string; value: string; set: (v: string) => void }[]
          ).map(({ label, value, set }) => (
            <div key={label} className="space-y-1">
              <Label className="text-right block">{label} (ل.س / شهر)</Label>
              <Input
                type="number"
                min={0}
                value={value}
                onChange={(e) => set(e.target.value)}
                className="text-right"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() =>
              mut.mutate({
                bicycle: parseInt(bicycle, 10) || 0,
                motorcycle: parseInt(motorcycle, 10) || 0,
                car: parseInt(car, 10) || 0,
              })
            }
            disabled={mut.isPending}
          >
            {mut.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
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
  plans: CourierSubPlans | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [months, setMonths] = useState("1");
  const [gifted, setGifted] = useState(false);
  const [note, setNote] = useState("");

  const vt = courier?.vehicleType ?? "motorcycle";
  const pricePerMonth = plans?.[vt] ?? 0;
  const totalAmount = (parseInt(months, 10) || 1) * pricePerMonth;

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
          <div className="bg-muted rounded-lg p-3 text-sm text-right space-y-1">
            <div>نوع المركبة: <span className="font-semibold">{VEHICLE_LABEL[vt]}</span></div>
            <div>السعر الشهري: <span className="font-semibold">{pricePerMonth.toLocaleString("ar-SY")} ل.س</span></div>
          </div>
          <div className="space-y-1">
            <Label className="text-right block">عدد الأشهر</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="text-right"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setGifted(false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                !gifted ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-input hover:bg-muted"
              }`}
            >
              مدفوع من المحفظة ({totalAmount.toLocaleString("ar-SY")} ل.س)
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
                months: parseInt(months, 10) || 1,
                gifted,
                note: note || null,
              })
            }
            disabled={mut.isPending}
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
  const [months, setMonths] = useState("1");

  const mut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { months: number } }) =>
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
            <Label className="text-right block">تمديد بعدد شهور</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="text-right"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() =>
              mut.mutate({ id: subscriptionId, data: { months: parseInt(months, 10) || 1 } })
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
                    <span className="font-semibold">{VEHICLE_LABEL[r.vehicleType] ?? r.vehicleType}</span>
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

export default function Subscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pricingOpen, setPricingOpen] = useState(false);
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
          <p className="text-muted-foreground text-sm mt-1">رسوم العمل الشهرية على المنصة</p>
        </div>
        <Button variant="outline" onClick={() => setPricingOpen(true)}>
          💰 أسعار الاشتراك
        </Button>
      </div>

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
                <TableHead className="text-right">المركبة</TableHead>
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
                    {VEHICLE_LABEL[courier.vehicleType] ?? courier.vehicleType}
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

      <PricingDialog
        open={pricingOpen}
        plans={plans}
        onClose={() => setPricingOpen(false)}
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
