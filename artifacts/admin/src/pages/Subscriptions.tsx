import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SubscriptionDay, CourierSubscriptionRow } from "@/lib/api";
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
  paid: "مدفوع ✓",
  waived: "معفى",
  pending: "غير مدفوع",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  waived: "secondary",
  pending: "destructive",
};

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function SubscriptionDialog({
  open,
  courier,
  defaultFee,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  courier: CourierSubscriptionRow | null;
  defaultFee: number;
  onClose: () => void;
  onSave: (data: { status: "paid" | "waived" | "pending"; amount: number; note: string }) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState<"paid" | "waived" | "pending">(
    courier?.status ?? "paid"
  );
  const [amount, setAmount] = useState<string>(String(courier?.amount ?? defaultFee));
  const [note, setNote] = useState(courier?.note ?? "");

  useEffect(() => {
    if (open) {
      setStatus(courier?.status ?? "paid");
      setAmount(String(courier?.amount ?? defaultFee));
      setNote(courier?.note ?? "");
    }
  }, [open, courier, defaultFee]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-right">
            تسجيل اشتراك — {courier?.name ?? ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-right block">حالة الاشتراك</Label>
            <div className="flex gap-2">
              {(["paid", "waived", "pending"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                    status === s
                      ? s === "paid"
                        ? "bg-primary text-primary-foreground border-primary"
                        : s === "waived"
                        ? "bg-secondary text-secondary-foreground border-secondary"
                        : "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-right block">المبلغ (ل.س)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right"
              min={0}
            />
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
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() =>
              onSave({ status, amount: parseInt(amount, 10) || 0, note })
            }
            disabled={saving}
          >
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Subscriptions() {
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [dialogCourier, setDialogCourier] = useState<CourierSubscriptionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsApp, setContactWhatsApp] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "subscriptions", selectedDate],
    queryFn: () => api.getSubscriptions(selectedDate),
  });

  const { data: settings } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: api.getSettings,
  });

  const saveMut = useMutation({
    mutationFn: api.saveSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      setDialogOpen(false);
      toast({ title: "تم الحفظ بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const settingsMut = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      setSettingsOpen(false);
      toast({ title: "تم تحديث الإعدادات" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const paidCount = data?.couriers.filter((c) => c.status === "paid").length ?? 0;
  const waivedCount = data?.couriers.filter((c) => c.status === "waived").length ?? 0;
  const pendingCount = data?.couriers.filter((c) => c.status === "pending").length ?? 0;
  const totalRevenue = data?.couriers
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.amount, 0) ?? 0;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">اشتراكات السائقين</h1>
          <p className="text-muted-foreground text-sm mt-1">
            رسوم العمل اليومية على المنصة
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-input rounded-md px-3 py-2 text-sm bg-background"
          />
          <Button
            variant="outline"
            onClick={() => {
              setFeeInput(settings?.daily_subscription_fee ?? String(data?.defaultFee ?? 5000));
              setContactPhone(settings?.contact_phone ?? "");
              setContactWhatsApp(settings?.contact_whatsapp ?? "");
              setSettingsOpen(true);
            }}
          >
            ⚙️ إعدادات التطبيق
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-primary">{paidCount}</div>
          <div className="text-sm text-muted-foreground mt-1">مدفوع</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-yellow-600">{waivedCount}</div>
          <div className="text-sm text-muted-foreground mt-1">معفى</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-destructive">{pendingCount}</div>
          <div className="text-sm text-muted-foreground mt-1">غير مدفوع</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-green-600">
            {totalRevenue.toLocaleString("ar-SY")} ل.س
          </div>
          <div className="text-sm text-muted-foreground mt-1">إجمالي اليوم</div>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
        ) : !data?.couriers.length ? (
          <div className="p-12 text-center text-muted-foreground">
            لا يوجد سائقون مسجلون
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">السائق</TableHead>
                <TableHead className="text-right">الجوال</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">ملاحظة</TableHead>
                <TableHead className="text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.couriers.map((courier) => (
                <TableRow key={courier.courierId}>
                  <TableCell className="font-medium text-right">{courier.name || "—"}</TableCell>
                  <TableCell className="text-right" dir="ltr">{courier.phone}</TableCell>
                  <TableCell className="text-right">
                    {courier.amount.toLocaleString("ar-SY")} ل.س
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={STATUS_VARIANT[courier.status] ?? "outline"}>
                      {STATUS_LABEL[courier.status] ?? courier.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {courier.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDialogCourier(courier);
                        setDialogOpen(true);
                      }}
                    >
                      تسجيل دفعة
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <SubscriptionDialog
        open={dialogOpen}
        courier={dialogCourier}
        defaultFee={data?.defaultFee ?? 5000}
        onClose={() => setDialogOpen(false)}
        onSave={(formData) => {
          if (!dialogCourier) return;
          saveMut.mutate({
            courierId: dialogCourier.courierId,
            date: selectedDate,
            status: formData.status,
            amount: formData.amount,
            note: formData.note || null,
          });
        }}
        saving={saveMut.isPending}
      />

      <Dialog open={settingsOpen} onOpenChange={(o) => !o && setSettingsOpen(false)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إعدادات التطبيق</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1">
              <Label className="text-right block">الرسوم اليومية الافتراضية (ل.س)</Label>
              <Input
                type="number"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className="text-right"
                min={0}
              />
              <p className="text-xs text-muted-foreground text-right">
                تُطبَّق على كل السائقين عند تسجيل دفعة جديدة ما لم يُحدَّد مبلغ مختلف
              </p>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-right">معلومات التواصل (تظهر في تطبيق السائق)</p>
              <div className="space-y-1">
                <Label className="text-right block">رقم هاتف الإدارة</Label>
                <Input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="text-right"
                  placeholder="+963999000111"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-right block">رقم واتساب الإدارة</Label>
                <Input
                  type="tel"
                  value={contactWhatsApp}
                  onChange={(e) => setContactWhatsApp(e.target.value)}
                  className="text-right"
                  placeholder="+963999000111"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground text-right">
                  اتركه فارغاً لاستخدام رقم الهاتف نفسه
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() =>
                settingsMut.mutate({
                  daily_subscription_fee: feeInput,
                  ...(contactPhone ? { contact_phone: contactPhone } : {}),
                  ...(contactWhatsApp ? { contact_whatsapp: contactWhatsApp } : contactPhone ? { contact_whatsapp: contactPhone } : {}),
                })
              }
              disabled={settingsMut.isPending}
            >
              {settingsMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
