import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type StampProgramInput, type StampRestaurantRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const fmt = (n: number) => n.toLocaleString("en-US");

const DEFAULTS: StampProgramInput = {
  enabled: true, goal: 5, minOrder: 0, rewardType: "item", rewardAmount: 0, rewardItemId: null, couponDays: 30, monthlyCap: null,
};

function rewardText(p: StampRestaurantRow["program"]): string {
  if (!p) return "";
  return p.rewardType === "item" ? `${p.rewardItemName ?? "صنف"} ببلاش` : `خصم ${fmt(p.rewardAmount)} ل.س`;
}

/** The terms agreed with one restaurant. */
function ProgramForm({ row, onDone }: { row: StampRestaurantRow; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<StampProgramInput>(() =>
    row.program
      ? { enabled: row.program.enabled, goal: row.program.goal, minOrder: row.program.minOrder, rewardType: row.program.rewardType,
          rewardAmount: row.program.rewardAmount, rewardItemId: row.program.rewardItemId, couponDays: row.program.couponDays, monthlyCap: row.program.monthlyCap }
      : DEFAULTS,
  );
  const set = <K extends keyof StampProgramInput>(k: K, v: StampProgramInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const { data: menu } = useQuery({
    queryKey: ["admin", "stamps", "menu", row.restaurantId],
    queryFn: () => api.getStampMenu(row.restaurantId),
  });
  const save = useMutation({
    mutationFn: () => api.saveStampProgram(row.restaurantId, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "stamps"] });
      toast({ title: form.enabled ? `«اطلب واربح» شغّال عند ${row.restaurantName}` : `انوقف عند ${row.restaurantName}` });
      onDone();
    },
    onError: (e) => toast({ title: "ما انحفظ", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
  });
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span className="font-bold">مشترك بـ«اطلب واربح»</span>
        <Switch checked={form.enabled} onCheckedChange={(v: boolean) => set("enabled", v)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1"><span className="text-muted-foreground">عدد الأختام</span>
          <Input type="number" min={2} max={20} value={form.goal} onChange={(e) => set("goal", num(e.target.value))} /></label>
        <label className="space-y-1"><span className="text-muted-foreground">أقل طلب ليتحسب ختم (ل.س)</span>
          <Input type="number" min={0} value={form.minOrder} onChange={(e) => set("minOrder", num(e.target.value))} /></label>
        <label className="space-y-1"><span className="text-muted-foreground">صلاحية الكوبون (يوم)</span>
          <Input type="number" min={1} max={365} value={form.couponDays} onChange={(e) => set("couponDays", num(e.target.value))} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1"><span className="text-muted-foreground">الجايزة</span>
          <select className="h-9 w-full rounded-md border bg-background px-2" value={form.rewardType}
            onChange={(e) => set("rewardType", e.target.value as "amount" | "item")}>
            <option value="item">صنف مجاني من المنيو</option>
            <option value="amount">مبلغ خصم</option>
          </select></label>
        {form.rewardType === "item" ? (
          <label className="space-y-1 sm:col-span-2"><span className="text-muted-foreground">الصنف</span>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={form.rewardItemId ?? ""}
              onChange={(e) => set("rewardItemId", e.target.value || null)}>
              <option value="">— اختار —</option>
              {(menu?.items ?? []).map((it) => <option key={it.id} value={it.id}>{it.nameAr} · {fmt(it.price)} ل.س</option>)}
            </select></label>
        ) : (
          <label className="space-y-1 sm:col-span-2"><span className="text-muted-foreground">المبلغ (ل.س) — بينخصم من الأكل بس</span>
            <Input type="number" min={1} value={form.rewardAmount} onChange={(e) => set("rewardAmount", num(e.target.value))} /></label>
        )}
      </div>
      <label className="block space-y-1"><span className="text-muted-foreground">سقف الكوبونات بالشهر (فاضي = بلا سقف)</span>
        <Input type="number" min={0} className="max-w-[200px]" value={form.monthlyCap ?? ""}
          onChange={(e) => set("monthlyCap", e.target.value.trim() === "" ? null : num(e.target.value))} /></label>
      <p className="text-xs text-muted-foreground">
        ختم واحد باليوم لكل زبون، على الطلبات المُسلَّمة من المنيو بس. الكوبون بينخصم من فاتورة المطعم ولا مرة من أجرة التوصيل،
        والمطعم والمندوب بيشوفوه مكتوب على الطلب.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>حفظ</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </div>
  );
}

/** «اطلب واربح»: stamp cards funded by each partner restaurant. */
export default function Stamps() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stamps"], queryFn: api.getStamps });
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => (data?.restaurants ?? []).filter((r) => !q.trim() || r.restaurantName.includes(q.trim())),
    [data, q],
  );
  const active = (data?.restaurants ?? []).filter((r) => r.program?.enabled);
  const totals = active.reduce(
    (t, r) => ({ coupons: t.coupons + r.stats.couponsIssued, used: t.used + r.stats.couponsUsed, orders: t.orders + r.stats.stampedOrders }),
    { coupons: 0, used: 0, orders: 0 },
  );
  useEffect(() => { if (editing && !rows.some((r) => r.restaurantId === editing)) setEditing(null); }, [rows, editing]);

  if (isLoading || !data) return <div className="p-6 text-muted-foreground">عم يحمّل…</div>;

  return (
    <div className="space-y-4 p-4 md:p-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">اطلب واربح</h1>
        <p className="text-sm text-muted-foreground">
          كرت أختام لكل مطعم متعاقد: بعد عدد طلبات بيحدده المطعم، الزبون بياخد كوبون بينصرف عنده بس. المطعم هو يلي بيدفع الجايزة.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["مطاعم مشتركة", active.length],
          ["طلبات انختمت", totals.orders],
          ["كوبونات طلعت", totals.coupons],
          ["كوبونات انصرفت", totals.used],
        ].map(([label, value]) => (
          <Card key={String(label)}><CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold tabular-nums">{fmt(Number(value))}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <CardTitle className="text-base">المطاعم</CardTitle>
          <Input placeholder="ابحث عن مطعم" className="max-w-[220px]" value={q} onChange={(e) => setQ(e.target.value)} />
        </CardHeader>
        <CardContent className="divide-y text-sm">
          {rows.map((r) => (
            <div key={r.restaurantId} className="space-y-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <b>{r.restaurantName}</b>
                    {r.program?.enabled
                      ? <Badge>مشترك</Badge>
                      : r.program ? <Badge variant="outline">موقوف</Badge> : null}
                  </div>
                  {r.program && (
                    <div className="text-xs text-muted-foreground">
                      {r.program.goal} أختام · فوق {fmt(r.program.minOrder)} ل.س · الجايزة: {rewardText(r.program)} · صالح {r.program.couponDays} يوم
                      {r.program.monthlyCap ? ` · سقف ${r.program.monthlyCap} بالشهر (طلع ${r.stats.couponsThisMonth})` : ""}
                    </div>
                  )}
                  {r.program && (
                    <div className="text-xs text-muted-foreground">
                      {fmt(r.stats.collecting)} زبون عم يجمع · {fmt(r.stats.stampedOrders)} طلب انختم · {fmt(r.stats.couponsIssued)} كوبون طلع ·
                      {" "}{fmt(r.stats.couponsUsed)} انصرف ({fmt(r.stats.discountGiven)} ل.س)
                    </div>
                  )}
                </div>
                {editing !== r.restaurantId && (
                  <Button size="sm" variant={r.program ? "outline" : "default"} onClick={() => setEditing(r.restaurantId)}>
                    {r.program ? "تعديل الشروط" : "شغّل عنده"}
                  </Button>
                )}
              </div>
              {editing === r.restaurantId && <ProgramForm row={r} onDone={() => setEditing(null)} />}
            </div>
          ))}
          {rows.length === 0 && <p className="py-4 text-muted-foreground">ما في مطاعم بهالاسم.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
