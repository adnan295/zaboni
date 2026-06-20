import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CustomerSubscriptionRow, CustomerSubscriptionSettings } from "@/lib/api";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(endsAt: string) {
  return new Date(endsAt) < new Date();
}

export default function CustomerSubscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addDays, setAddDays] = useState("30");

  const [priceInput, setPriceInput] = useState("");
  const [deliveryFeeInput, setDeliveryFeeInput] = useState("");

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin", "customer-subscriptions"],
    queryFn: api.getCustomerSubscriptions,
  });

  const { data: settings } = useQuery({
    queryKey: ["admin", "customer-subscription-settings"],
    queryFn: api.getCustomerSubscriptionSettings,
  });

  const addMut = useMutation({
    mutationFn: (data: { userId: string; durationDays: number }) =>
      api.createCustomerSubscription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customer-subscriptions"] });
      setAddOpen(false);
      setAddUserId("");
      setAddDays("30");
      toast({ title: "تم تفعيل الاشتراك بنجاح" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.toggleCustomerSubscription(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customer-subscriptions"] });
      toast({ title: "تم التحديث" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const settingsMut = useMutation({
    mutationFn: (data: CustomerSubscriptionSettings) =>
      api.updateCustomerSubscriptionSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "customer-subscription-settings"] });
      setSettingsOpen(false);
      toast({ title: "تم حفظ الإعدادات" });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const activeCount = subs.filter((s) => s.isActive && !isExpired(s.endsAt)).length;
  const expiredCount = subs.filter((s) => !s.isActive || isExpired(s.endsAt)).length;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">اشتراكات التوصيل المجاني</h1>
          <p className="text-muted-foreground text-sm mt-1">
            العملاء المشتركون في باقة التوصيل المجاني الشهرية
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              setPriceInput(String(settings?.monthlyPrice ?? 10000));
              setDeliveryFeeInput(String(settings?.subscriberDeliveryFee ?? 0));
              setSettingsOpen(true);
            }}
          >
            ⚙️ إعدادات الباقة
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            ＋ تفعيل اشتراك
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-primary">{activeCount}</div>
          <div className="text-sm text-muted-foreground mt-1">مشترك نشط</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-muted-foreground">{expiredCount}</div>
          <div className="text-sm text-muted-foreground mt-1">منتهي / ملغى</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-green-600">
            {(settings?.monthlyPrice ?? 0).toLocaleString("ar-SY")} ل.س
          </div>
          <div className="text-sm text-muted-foreground mt-1">سعر الباقة الشهرية</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-right">
          <div className="text-2xl font-bold text-blue-600">
            {(settings?.subscriberDeliveryFee ?? 0).toLocaleString("ar-SY")} ل.س
          </div>
          <div className="text-sm text-muted-foreground mt-1">رسوم توصيل المشتركين</div>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
        ) : subs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">لا توجد اشتراكات بعد</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">الهاتف</TableHead>
                <TableHead className="text-right">بداية</TableHead>
                <TableHead className="text-right">نهاية</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((sub) => {
                const expired = isExpired(sub.endsAt);
                const active = sub.isActive && !expired;
                return (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium text-right">
                      {sub.userName || "—"}
                      {sub.createdByAdmin && (
                        <span className="text-xs text-muted-foreground mr-1">(أدمن)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" dir="ltr">{sub.userPhone}</TableCell>
                    <TableCell className="text-right text-sm">{formatDate(sub.startsAt)}</TableCell>
                    <TableCell className="text-right text-sm">{formatDate(sub.endsAt)}</TableCell>
                    <TableCell className="text-right">
                      {sub.pricePaid.toLocaleString("ar-SY")} ل.س
                    </TableCell>
                    <TableCell className="text-right">
                      {expired ? (
                        <Badge variant="outline">منتهي</Badge>
                      ) : active ? (
                        <Badge variant="default">نشط ⭐</Badge>
                      ) : (
                        <Badge variant="destructive">ملغى</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!expired && (
                        <Button
                          size="sm"
                          variant={active ? "outline" : "default"}
                          onClick={() => toggleMut.mutate({ id: sub.id, isActive: !sub.isActive })}
                          disabled={toggleMut.isPending}
                        >
                          {active ? "إيقاف" : "تفعيل"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">تفعيل اشتراك يدوي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-right block">معرّف العميل (User ID)</Label>
              <Input
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                placeholder="أدخل user_id..."
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground text-right">
                انسخ الـ ID من صفحة المستخدمين
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-right block">مدة الاشتراك (بالأيام)</Label>
              <Input
                type="number"
                value={addDays}
                onChange={(e) => setAddDays(e.target.value)}
                min={1}
                className="text-right"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button
              onClick={() =>
                addMut.mutate({ userId: addUserId.trim(), durationDays: parseInt(addDays, 10) || 30 })
              }
              disabled={addMut.isPending || !addUserId.trim()}
            >
              {addMut.isPending ? "جاري التفعيل..." : "تفعيل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={(o) => !o && setSettingsOpen(false)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إعدادات باقة التوصيل المجاني</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-right block">سعر الباقة الشهرية (ل.س)</Label>
              <Input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                min={0}
                className="text-right"
              />
              <p className="text-xs text-muted-foreground text-right">
                يُخصم من رصيد المحفظة عند الاشتراك
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-right block">رسوم التوصيل للمشتركين (ل.س)</Label>
              <Input
                type="number"
                value={deliveryFeeInput}
                onChange={(e) => setDeliveryFeeInput(e.target.value)}
                min={0}
                className="text-right"
              />
              <p className="text-xs text-muted-foreground text-right">
                0 = توصيل مجاني تماماً. أي قيمة أخرى = رسوم ثابتة للمشتركين
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>إلغاء</Button>
            <Button
              onClick={() =>
                settingsMut.mutate({
                  monthlyPrice: parseInt(priceInput, 10) || 0,
                  subscriberDeliveryFee: parseInt(deliveryFeeInput, 10) || 0,
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
