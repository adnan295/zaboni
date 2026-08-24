import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromoCode, type PromoUse } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ---- Plain-Arabic labels so the admin reads meaning, not raw enum values ----
const APPLIES_LABEL: Record<string, string> = {
  delivery: "التوصيل",
  food: "الأكل",
  order: "الطلب",
};
const AUDIENCE_LABEL: Record<string, string> = {
  all: "الكل",
  specific: "أرقام محدّدة",
  new: "زبائن جدد",
  inactive: "غير نشطين",
};

// One-line human summary of what a code actually does. This is the antidote to
// "hard to control": the admin sees the effect spelled out before saving.
function describePromo(f: {
  type: string;
  value: string;
  appliesTo: string;
  audience: string;
  firstOrderOnly: boolean;
  autoApply: boolean;
  minOrderValue: string;
}): string {
  const v = f.value.trim();
  const on = APPLIES_LABEL[f.appliesTo] ?? f.appliesTo;
  let amount: string;
  if (f.appliesTo === "delivery" && f.type === "percent" && Number(v) >= 100) {
    amount = "توصيل مجاني";
  } else if (!v) {
    amount = "…";
  } else if (f.type === "percent") {
    amount = `خصم ${v}% على ${on}`;
  } else {
    amount = `خصم ${Number(v).toLocaleString()} ل.س على ${on}`;
  }
  const bits: string[] = [amount];
  if (f.audience !== "all") bits.push(`لـ«${AUDIENCE_LABEL[f.audience]}»`);
  if (f.firstOrderOnly) bits.push("لأول طلب فقط");
  if (f.minOrderValue.trim()) bits.push(`بطلب ≥ ${Number(f.minOrderValue).toLocaleString()} ل.س`);
  bits.push(f.autoApply ? "— يُطبَّق تلقائيًا" : "— بإدخال الكود");
  return bits.join(" ");
}

// Quick-start presets: pick a goal, the fields fill themselves.
type PresetKind = "free-first-delivery" | "percent-food" | "fixed-delivery" | "specific";
const PRESETS: { kind: PresetKind; icon: string; title: string; hint: string }[] = [
  { kind: "free-first-delivery", icon: "🚚", title: "توصيل مجاني لأول طلب", hint: "تلقائي — بدون كود" },
  { kind: "percent-food", icon: "％", title: "خصم نسبة على الأكل", hint: "مثال: 20%" },
  { kind: "fixed-delivery", icon: "🏷️", title: "خصم ثابت على التوصيل", hint: "مثال: 50 ل.س" },
  { kind: "specific", icon: "🎯", title: "كود لأرقام محدّدة", hint: "تبعتو لزباين معيّنين" },
];

function PromoFormDialog({
  open,
  promo,
  onClose,
}: {
  open: boolean;
  promo: PromoCode | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!promo;

  const buildForm = (p: PromoCode | null) => ({
    code: p?.code ?? "",
    type: (p?.type ?? "fixed") as "percent" | "fixed",
    value: String(p?.value ?? ""),
    maxUses: p?.maxUses != null ? String(p.maxUses) : "",
    maxUsesPerUser: String(p?.maxUsesPerUser ?? 1),
    expiresAt: p?.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 16) : "",
    isActive: p?.isActive ?? true,
    appliesTo: (p?.appliesTo ?? "delivery") as "delivery" | "food" | "order",
    maxDiscount: p?.maxDiscount != null ? String(p.maxDiscount) : "",
    minOrderValue: p?.minOrderValue != null ? String(p.minOrderValue) : "",
    startsAt: p?.startsAt ? new Date(p.startsAt).toISOString().slice(0, 16) : "",
    firstOrderOnly: p?.firstOrderOnly ?? false,
    audience: (p?.audience ?? "all") as "all" | "specific" | "new" | "inactive",
    inactiveDays: p?.inactiveDays != null ? String(p.inactiveDays) : "30",
    autoApply: p?.autoApply ?? false,
    titleAr: p?.titleAr ?? "",
    targetPhones: (p?.targetPhones ?? []).join("\n"),
  });

  const [form, setForm] = useState(buildForm(promo));
  // Advanced fields stay folded so the common case is short. Auto-open on edit
  // when the code already uses an advanced setting, so nothing hides silently.
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (open) {
      const f = buildForm(promo);
      setForm(f);
      setAdvanced(
        !!promo &&
          (!!f.maxUses || !!f.startsAt || !!f.minOrderValue || !!f.maxDiscount ||
            f.maxUsesPerUser !== "1"),
      );
    }
  }, [open, promo]);

  const randomCode = (prefix: string) =>
    `${prefix}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const applyPreset = (kind: PresetKind) => {
    setForm((f) => {
      const base = { ...f };
      switch (kind) {
        case "free-first-delivery":
          return {
            ...base,
            type: "percent", value: "100", appliesTo: "delivery",
            firstOrderOnly: true, autoApply: true, audience: "all",
            titleAr: base.titleAr || "توصيل مجاني لأول طلب 🎉",
            code: base.code || randomCode("FREE"),
          };
        case "percent-food":
          return {
            ...base,
            type: "percent", appliesTo: "food", autoApply: false,
            firstOrderOnly: false, audience: "all", titleAr: "",
            code: base.code || randomCode("SAVE"),
          };
        case "fixed-delivery":
          return {
            ...base,
            type: "fixed", appliesTo: "delivery", autoApply: false,
            firstOrderOnly: false, audience: "all", titleAr: "",
            code: base.code || randomCode("SHIP"),
          };
        case "specific":
          return {
            ...base,
            audience: "specific", autoApply: false,
            code: base.code || randomCode("VIP"),
          };
        default:
          return base;
      }
    });
  };

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.createPromo>[0]) =>
      isEdit ? api.updatePromo(promo!.id, data) : api.createPromo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
      toast({ title: isEdit ? "تم تحديث الكود" : "تم إنشاء الكود" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      code: form.code.toUpperCase(),
      type: form.type,
      value: parseFloat(form.value),
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      maxUsesPerUser: parseInt(form.maxUsesPerUser) || 1,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive: form.isActive,
      appliesTo: form.appliesTo,
      maxDiscount: form.maxDiscount ? parseInt(form.maxDiscount) : null,
      minOrderValue: form.minOrderValue ? parseInt(form.minOrderValue) : null,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      firstOrderOnly: form.firstOrderOnly,
      audience: form.audience,
      inactiveDays: form.audience === "inactive" ? (parseInt(form.inactiveDays) || 30) : null,
      autoApply: form.autoApply,
      titleAr: form.titleAr.trim(),
      // Always send the list so switching away from "specific" clears old targets.
      targetPhones: form.audience === "specific"
        ? form.targetPhones.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
        : [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل كود الخصم" : "إنشاء كود خصم"}</DialogTitle>
        </DialogHeader>

        {/* Quick-start presets (create only) */}
        {!isEdit && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            {PRESETS.map((p) => (
              <button
                key={p.kind}
                type="button"
                onClick={() => applyPreset(p.kind)}
                className="text-right rounded-lg border p-2.5 hover:border-primary hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.icon}</span>
                  <span className="text-sm font-semibold">{p.title}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{p.hint}</div>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          {/* Live plain-Arabic summary of the effect */}
          <div className="rounded-md bg-primary/10 text-primary text-sm px-3 py-2 font-medium">
            {describePromo(form)}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">الكود</label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER20"
              disabled={isEdit}
              required
              maxLength={50}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">النوع</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "percent" | "fixed" }))}
              >
                <option value="fixed">ثابت (ل.س)</option>
                <option value="percent">نسبة مئوية (%)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">القيمة</label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={form.type === "percent" ? "20" : "5000"}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">الخصم على</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={form.appliesTo}
              onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value as "delivery" | "food" | "order" }))}
            >
              <option value="delivery">رسوم التوصيل (للتوصيل المجاني: النوع نسبة % والقيمة 100)</option>
              <option value="food">سعر الأكل</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">لمين هالكود؟</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={form.audience}
              onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as "all" | "specific" | "new" | "inactive" }))}
            >
              <option value="all">الكل</option>
              <option value="specific">أرقام محدّدة</option>
              <option value="new">زبائن جدد (ما طلبوا ولا مرة)</option>
              <option value="inactive">زبائن غير نشطين</option>
            </select>
          </div>
          {form.audience === "specific" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">الأرقام (كل رقم بسطر، أو مفصولة بفاصلة)</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] font-mono"
                dir="ltr"
                value={form.targetPhones}
                onChange={(e) => setForm((f) => ({ ...f, targetPhones: e.target.value }))}
                placeholder={"+963991234567\n+963997654321"}
              />
              <p className="text-[11px] text-muted-foreground">بعد الحفظ فيك تبعتلن الكود مباشرة من زر «إرسال» بالجدول.</p>
            </div>
          )}
          {form.audience === "inactive" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">غير نشط منذ (أيام)</label>
              <Input type="number" min="1" value={form.inactiveDays}
                onChange={(e) => setForm((f) => ({ ...f, inactiveDays: e.target.value }))} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="firstOrderOnly" checked={form.firstOrderOnly}
              onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} className="w-4 h-4" />
            <label htmlFor="firstOrderOnly" className="text-sm font-medium">أول طلب فقط</label>
          </div>

          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoApply" checked={form.autoApply}
                onChange={(e) => setForm((f) => ({ ...f, autoApply: e.target.checked }))} className="w-4 h-4" />
              <label htmlFor="autoApply" className="text-sm font-medium">⭐ تطبيق تلقائي (بدون كتابة كود)</label>
            </div>
            <p className="text-xs text-muted-foreground">
              مثال: «توصيل مجاني لأول طلب» — بينطبق تلقائيًا للمؤهّلين، وبيظهر بالتطبيق قبل الطلب.
            </p>
            {form.autoApply && (
              <div className="space-y-1">
                <label className="text-xs font-medium">العنوان اللي بيشوفه الزبون</label>
                <Input value={form.titleAr}
                  onChange={(e) => setForm((f) => ({ ...f, titleAr: e.target.value }))}
                  placeholder="توصيل مجاني لأول طلب 🎉" />
              </div>
            )}
          </div>

          {/* Advanced options folded away by default */}
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            className="text-sm font-medium text-primary"
          >
            {advanced ? "▲ إخفاء الخيارات المتقدمة" : "▼ خيارات متقدمة (حدود، تواريخ، سقف)"}
          </button>
          {advanced && (
            <div className="space-y-4 border-t pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">الحد الأقصى للاستخدام</label>
                  <Input type="number" min="1" value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                    placeholder="غير محدود" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">الحد لكل مستخدم</label>
                  <Input type="number" min="1" value={form.maxUsesPerUser}
                    onChange={(e) => setForm((f) => ({ ...f, maxUsesPerUser: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">حد أدنى للطلب (ل.س)</label>
                  <Input type="number" min="0" value={form.minOrderValue}
                    onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                    placeholder="بدون" />
                </div>
                {form.type === "percent" && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">سقف الخصم (ل.س)</label>
                    <Input type="number" min="0" value={form.maxDiscount}
                      onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                      placeholder="بدون سقف" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">تاريخ البداية</label>
                  <Input type="datetime-local" value={form.startsAt}
                    onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">تاريخ الانتهاء</label>
                  <Input type="datetime-local" value={form.expiresAt}
                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4" />
                <label htmlFor="isActive" className="text-sm font-medium">مفعّل</label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "جاري الحفظ..." : isEdit ? "تحديث" : "إنشاء"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Modal: who redeemed this code ----
function UsesDialog({ promo, onClose }: { promo: PromoCode | null; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "promo-uses", promo?.id],
    queryFn: () => api.getPromoUses(promo!.id),
    enabled: !!promo,
  });

  const copyPhones = () => {
    const phones = (data ?? []).map((u) => u.userPhone).filter(Boolean).join("\n");
    if (phones) {
      void navigator.clipboard?.writeText(phones);
      toast({ title: "تم نسخ الأرقام" });
    }
  };

  return (
    <Dialog open={!!promo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مين استخدم «{promo?.code}»</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="py-8 text-center text-muted-foreground">جاري التحميل...</div>}
        {data && data.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">لسا ما حدا استخدم هالكود.</div>
        )}
        {data && data.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{data.length} استخدام</span>
              <Button size="sm" variant="outline" onClick={copyPhones}>نسخ كل الأرقام</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">الاسم</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">الرقم</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">الخصم</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u, i) => (
                    <tr key={`${u.orderId}-${i}`} className="border-b">
                      <td className="px-3 py-2">{u.userName || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 font-mono" dir="ltr">{u.userPhone || "—"}</td>
                      <td className="px-3 py-2">{u.discountAmount.toLocaleString()} ل.س</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(u.usedAt).toLocaleDateString("ar-SY", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Modal: send this code to customers over WhatsApp/SMS ----
function SendDialog({ promo, onClose }: { promo: PromoCode | null; onClose: () => void }) {
  const { toast } = useToast();
  const [phones, setPhones] = useState("");
  const [message, setMessage] = useState("");
  const [loadingSeg, setLoadingSeg] = useState<string | null>(null);

  // Pull a whole segment's phones so the admin never types numbers by hand.
  const loadSegment = async (segment: "all" | "new" | "inactive", label: string) => {
    setLoadingSeg(segment);
    try {
      const r = await api.getCustomerPhones(segment, segment === "inactive" ? (promo?.inactiveDays ?? 30) : undefined);
      setPhones(r.phones.join("\n"));
      toast({ title: `تم تحميل ${r.count} رقم (${label})` });
    } catch (e) {
      toast({ title: "خطأ", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingSeg(null);
    }
  };

  useEffect(() => {
    if (!promo) return;
    setMessage("");
    // Auto-fill recipients from the code's own audience so it opens ready to send.
    if (promo.audience === "specific") {
      setPhones((promo.targetPhones ?? []).join("\n"));
    } else if (promo.audience === "new") {
      void loadSegment("new", "زبائن جدد");
    } else if (promo.audience === "inactive") {
      void loadSegment("inactive", "غير نشطين");
    } else {
      setPhones("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo]);

  const mutation = useMutation({
    mutationFn: () =>
      api.sendPromo(promo!.id, {
        phones: phones.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
        message: message.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast({
        title: `تم الإرسال لـ ${r.sent} رقم`,
        description: r.failed > 0 ? `فشل ${r.failed}: ${r.failures.slice(0, 5).join(", ")}` : undefined,
        variant: r.failed > 0 ? "destructive" : undefined,
      });
      if (r.failed === 0) onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const count = phones.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length;

  return (
    <Dialog open={!!promo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إرسال «{promo?.code}» للزباين</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">تعبئة سريعة للأرقام</label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!!loadingSeg}
                onClick={() => loadSegment("all", "كل الزباين")}>
                {loadingSeg === "all" ? "..." : "كل الزباين"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!loadingSeg}
                onClick={() => loadSegment("new", "زبائن جدد")}>
                {loadingSeg === "new" ? "..." : "زبائن جدد"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!!loadingSeg}
                onClick={() => loadSegment("inactive", "غير نشطين")}>
                {loadingSeg === "inactive" ? "..." : "غير نشطين"}
              </Button>
              {phones && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPhones("")}>مسح</Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">اضغط زر لتعبئة أرقام الفئة تلقائيًا، أو اكتب أرقام يدويًا تحت.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">الأرقام ({count})</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[110px] font-mono"
              dir="ltr"
              value={phones}
              onChange={(e) => setPhones(e.target.value)}
              placeholder={"+963991234567\n+963997654321"}
            />
            <p className="text-[11px] text-muted-foreground">كل رقم بسطر أو مفصولة بفاصلة. بينبعت واتساب، وإذا فشل بينبعت SMS.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">رسالة مخصّصة (اختياري)</label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[70px]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`اتركها فاضية لرسالة جاهزة فيها الكود. استخدم {code} ليتحوّل للكود.`}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || count === 0}>
            {mutation.isPending ? "جاري الإرسال..." : `إرسال (${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PromosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "promos"],
    queryFn: api.getPromos,
    refetchInterval: 15_000,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [usesFor, setUsesFor] = useState<PromoCode | null>(null);
  const [sendFor, setSendFor] = useState<PromoCode | null>(null);

  const deleteMutation = useMutation({
    mutationFn: api.deletePromo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
      toast({ title: "تم حذف الكود" });
    },
    onError: (e: Error) => {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updatePromo(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "promos"] });
    },
  });

  const handleDelete = (id: string, code: string) => {
    if (!confirm(`حذف الكود "${code}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    deleteMutation.mutate(id);
  };

  const active = data?.filter((p) => p.isActive) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">أكواد الخصم</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة أكواد الخصم للعملاء</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          + كود جديد
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{data.length}</div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي الأكواد</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-500">{active.length}</div>
              <div className="text-sm text-muted-foreground mt-1">نشط</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-500">
                {data.reduce((s, p) => s + (p.usesCount ?? 0), 0)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">إجمالي الاستخدامات</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">جاري التحميل...</div>
          )}
          {data && data.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <span className="text-3xl">🎟️</span>
              <span className="text-sm">لا توجد أكواد خصم بعد</span>
            </div>
          )}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">الكود</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">القيمة</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">على</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">لمين</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">الاستخدامات</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">الحالة</th>
                    <th className="px-4 py-3 text-right font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => {
                    const expired = p.expiresAt ? new Date(p.expiresAt) < new Date() : false;
                    const exhausted = p.maxUses != null && (p.usesCount ?? 0) >= p.maxUses;
                    return (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary">{p.code}</span>
                            {p.autoApply && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-semibold">⚡ تلقائي</span>
                            )}
                          </div>
                          {p.autoApply && p.titleAr && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">{p.titleAr}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {p.appliesTo === "delivery" && p.type === "percent" && p.value >= 100
                            ? "مجاني"
                            : p.type === "percent" ? `${p.value}%` : `${p.value.toLocaleString()} ل.س`}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {APPLIES_LABEL[p.appliesTo] ?? p.appliesTo}
                          {p.firstOrderOnly && <span className="text-[10px] block">أول طلب</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {AUDIENCE_LABEL[p.audience] ?? p.audience}
                          {p.audience === "specific" && p.targetPhones && (
                            <span className="text-[10px] block">{p.targetPhones.length} رقم</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="text-primary hover:underline"
                            onClick={() => setUsesFor(p)}
                          >
                            {p.usesCount ?? 0}{p.maxUses != null ? ` / ${p.maxUses}` : ""}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            !p.isActive || expired || exhausted
                              ? "bg-muted text-muted-foreground"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}>
                            {!p.isActive ? "معطّل" : expired ? "منتهي" : exhausted ? "مستنفَد" : "نشط"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSendFor(p)}>إرسال</Button>
                            <Button size="sm" variant="outline" onClick={() => { setEditing(p); setDialogOpen(true); }}>تعديل</Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleMutation.mutate({ id: p.id, isActive: !p.isActive })}
                              disabled={toggleMutation.isPending}
                            >
                              {p.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(p.id, p.code)}
                              disabled={deleteMutation.isPending}
                            >
                              حذف
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PromoFormDialog
        open={dialogOpen}
        promo={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
      />
      <UsesDialog promo={usesFor} onClose={() => setUsesFor(null)} />
      <SendDialog promo={sendFor} onClose={() => setSendFor(null)} />
    </div>
  );
}
