import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type KitchenOverview, type KitchenMealAdmin, type KitchenDayOrders } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const num = (n: number) => n.toLocaleString("ar-SY");
const SECTIONS = [["home", "طبخ بيت"], ["healthy", "وجبات صحية"], ["dessert", "حلو صحّي"]] as const;
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("ar-SY", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
const windowLabel = (w: string) => w.split("-").map((h) => (Number(h) > 12 ? Number(h) - 12 : Number(h))).join(" - ");

function useOverview() {
  return useQuery({ queryKey: ["admin", "kitchen"], queryFn: () => api.get<KitchenOverview>("/admin/kitchen"), refetchInterval: 60_000 });
}

/** The switch that makes the whole section appear in the app, plus its rules. */
function SettingsCard({ data }: { data: KitchenOverview }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const s = data.settings;
  const [form, setForm] = useState({ title: s.title, cutoffHour: String(s.cutoffHour), windows: s.windows.join(","), discount: String(s.subscriptionDiscountPct) });
  useEffect(() => {
    setForm({ title: s.title, cutoffHour: String(s.cutoffHour), windows: s.windows.join(","), discount: String(s.subscriptionDiscountPct) });
  }, [s.title, s.cutoffHour, s.windows.join(","), s.subscriptionDiscountPct]);
  const save = useMutation({
    mutationFn: (settings: Record<string, string>) => api.updateSettings(settings),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "kitchen"] }); toast({ title: "انحفظ" }); },
    onError: () => toast({ title: "ما انحفظ التغيير", variant: "destructive" }),
  });
  const ready = data.kitchens.length > 0 && data.mealDays.some((d) => d.portions > d.sold);

  return (
    <Card className={s.enabled ? "border-green-400" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-4">
          <span>القسم بالتطبيق: {s.enabled ? <span className="text-green-700">شغّال وظاهر للزبائن</span> : <span className="text-muted-foreground">مطفي ومخفي</span>}</span>
          <Switch checked={s.enabled} disabled={save.isPending} onCheckedChange={(on) => save.mutate({ kitchen_enabled: on ? "true" : "false" })} />
        </CardTitle>
        <CardDescription>
          لما يكون مطفي ما بيبيّن أي شي للزبون وما بينقبل أي طلب. جهّز المطابخ والوجبات والحصص تحت، وبعدها شغّله.
          {!s.enabled && !ready && <span className="mt-1 block font-bold text-amber-700">لسا ما في مطبخ إله حصص متاحة للأيام الجاية، فالقسم رح يطلع فاضي إذا شغّلته هلق.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <label className="text-sm">اسم القسم<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="text-sm">ساعة إغلاق الطلب لبكرا (0-23)<Input type="number" min={0} max={23} value={form.cutoffHour} onChange={(e) => setForm({ ...form, cutoffHour: e.target.value })} /></label>
        <label className="text-sm">أوقات التوصيل<Input dir="ltr" value={form.windows} onChange={(e) => setForm({ ...form, windows: e.target.value })} placeholder="12-13,13-14,14-15" /></label>
        <label className="text-sm">خصم الاشتراك الأسبوعي ٪<Input type="number" min={0} max={50} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></label>
        <div className="md:col-span-4">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({
            kitchen_title: form.title, kitchen_cutoff_hour: form.cutoffHour, kitchen_windows: form.windows, kitchen_subscription_discount_pct: form.discount,
          })}>حفظ الإعدادات</Button>
          <span className="ms-3 text-xs text-muted-foreground">أوقات التوصيل بصيغة ساعة-ساعة بتوقيت 24، مفصولة بفواصل. الطلب بيتحوّل للمناديب قبل الموعد بـ {num(s.releaseLeadMinutes)} دقيقة.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function KitchensCard({ data }: { data: KitchenOverview }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pick, setPick] = useState("");
  const setKind = useMutation({
    mutationFn: ({ id, kitchen }: { id: string; kitchen: boolean }) => api.put(`/admin/kitchen/restaurants/${id}`, { kitchen }),
    onSuccess: () => { setPick(""); void qc.invalidateQueries({ queryKey: ["admin", "kitchen"] }); },
    onError: () => toast({ title: "ما زبط", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>المطابخ ({num(data.kitchens.length)})</CardTitle>
        <CardDescription>
          المطبخ بينضاف متل أي مطعم من صفحة «المطاعم» (الاسم، الموقع، الرقم، الوجبات والصور)، وبعدها بتحوّله لمطبخ من هون.
          المطبخ ما بيبيّن مع المطاعم العادية، بس بقسم «{data.settings.title}». رقم المطبخ بتوصله عليه رسالة واتساب بطلبات بكرا بعد إغلاق الطلب.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {data.kitchens.map((k) => (
            <span key={k.id} className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-sm">
              <b>{k.nameAr}</b>
              {!k.phone && <span className="text-xs text-amber-700">بلا رقم</span>}
              {!k.isOpen && <span className="text-xs text-red-600">مسكّر</span>}
              <button className="text-xs text-muted-foreground hover:text-red-600" onClick={() => { if (confirm(`ترجّع «${k.nameAr}» مطعم عادي؟`)) setKind.mutate({ id: k.id, kitchen: false }); }}>إزالة</button>
            </span>
          ))}
          {data.kitchens.length === 0 && <span className="text-sm text-muted-foreground">ما في مطابخ لسا.</span>}
        </div>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">اختار مطعم لتحوّله لمطبخ…</option>
            {data.otherRestaurants.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
          </select>
          <Button size="sm" disabled={!pick || setKind.isPending} onClick={() => setKind.mutate({ id: pick, kitchen: true })}>حوّله لمطبخ</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MealRow({ meal, kitchenName }: { meal: KitchenMealAdmin; kitchenName: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const initial = { section: meal.section ?? "home", calories: meal.calories ?? "", proteinG: meal.proteinG ?? "", carbsG: meal.carbsG ?? "", fatG: meal.fatG ?? "", tags: meal.tags.join("، ") };
  const [f, setF] = useState<Record<string, string | number>>(initial);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const n = (v: string | number) => (v === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: () => api.put(`/admin/kitchen/meals/${meal.id}`, {
      section: f.section, calories: n(f.calories), proteinG: n(f.proteinG), carbsG: n(f.carbsG), fatG: n(f.fatG),
      tags: String(f.tags).split(/[،,]/).map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "kitchen"] }); toast({ title: `انحفظت «${meal.nameAr}»` }); },
    onError: () => toast({ title: "ما انحفظ", variant: "destructive" }),
  });
  const cell = (k: string, w = "w-20") => <Input className={`h-8 ${w}`} type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  return (
    <tr className={!meal.isAvailable ? "opacity-50" : ""}>
      <td className="px-2 py-1.5"><div className="font-medium">{meal.nameAr}</div><div className="text-[11px] text-muted-foreground">{kitchenName} · {num(meal.price)} ل.س{!meal.isAvailable && " · غير متاح"}</div></td>
      <td className="px-2 py-1.5">
        <select className="h-8 rounded-md border bg-background px-1 text-sm" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
          {SECTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">{cell("calories")}</td>
      <td className="px-2 py-1.5">{cell("proteinG", "w-16")}</td>
      <td className="px-2 py-1.5">{cell("carbsG", "w-16")}</td>
      <td className="px-2 py-1.5">{cell("fatG", "w-16")}</td>
      <td className="px-2 py-1.5"><Input className="h-8 w-56" value={f.tags} placeholder="عالي البروتين، بلا سكر مضاف" onChange={(e) => setF({ ...f, tags: e.target.value })} /></td>
      <td className="px-2 py-1.5"><Button size="sm" className="h-8" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>حفظ</Button></td>
    </tr>
  );
}

function MealsCard({ data }: { data: KitchenOverview }) {
  const names = useMemo(() => new Map(data.kitchens.map((k) => [k.id, k.nameAr])), [data.kitchens]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>الوجبات والقيم الغذائية ({num(data.meals.length)})</CardTitle>
        <CardDescription>
          السعرات لازم تكون محسوبة صح (وصفة ثابتة وأوزان محددة، ويفضّل أخصائي تغذية). اتركها فاضية لطبخ البيت العادي اللي ما بدك تعرض إله سعرات.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {data.meals.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ضيف وجبات للمطبخ من صفحة «المطاعم»، وبتظهر هون.</p> : (
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/50 text-xs"><tr>
              <th className="px-2 py-2 text-right">الوجبة</th><th className="px-2 py-2 text-right">القسم</th><th className="px-2 py-2 text-right">سعرات</th>
              <th className="px-2 py-2 text-right">بروتين غ</th><th className="px-2 py-2 text-right">كربوهيدرات غ</th><th className="px-2 py-2 text-right">دهون غ</th>
              <th className="px-2 py-2 text-right">شارات</th><th></th>
            </tr></thead>
            <tbody className="divide-y">{data.meals.map((m) => <MealRow key={m.id} meal={m} kitchenName={names.get(m.kitchenId) ?? ""} />)}</tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function PortionCell({ mealId, day, portions, sold }: { mealId: string; day: string; portions: number; sold: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [v, setV] = useState(portions ? String(portions) : "");
  useEffect(() => { setV(portions ? String(portions) : ""); }, [portions]);
  const save = useMutation({
    mutationFn: (n: number) => api.put<{ portions: number; sold: number }>(`/admin/kitchen/meals/${mealId}/days/${day}`, { portions: n }),
    onSuccess: (out, n) => {
      void qc.invalidateQueries({ queryKey: ["admin", "kitchen"] });
      if (out.portions > n) toast({ title: `مباع منها ${num(out.sold)}، فما بتنزل تحت هالرقم` });
    },
    onError: () => toast({ title: "ما انحفظ", variant: "destructive" }),
  });
  const commit = () => { const n = Math.max(0, Math.floor(Number(v) || 0)); if (n !== portions) save.mutate(n); };
  return (
    <td className="px-1 py-1 text-center">
      <Input className={`mx-auto h-8 w-16 text-center ${portions > 0 ? "border-green-400" : ""}`} type="number" min={0} value={v} placeholder="—"
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {sold > 0 && <div className="text-[10px] font-bold text-green-700">مباع {num(sold)}</div>}
    </td>
  );
}

function PortionsCard({ data }: { data: KitchenOverview }) {
  const map = useMemo(() => new Map(data.mealDays.map((d) => [`${d.mealId}|${d.day}`, d])), [data.mealDays]);
  const names = useMemo(() => new Map(data.kitchens.map((k) => [k.id, k.nameAr])), [data.kitchens]);
  if (data.meals.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>حصص الأيام الجاية</CardTitle>
        <CardDescription>
          كم حصة بينطبخ من كل وجبة بكل يوم. الوجبة ما بتبيّن للزبون إلا باليوم اللي إلها فيه حصص. اكتب الرقم واطلع من الخانة لينحفظ.
          الطبّاخة فيها تعبّي هالجدول لحالها من لوحة المطعم تبعها.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/50 text-xs"><tr>
            <th className="px-2 py-2 text-right">الوجبة</th>
            {data.days.map((d) => <th key={d.day} className="px-1 py-2 text-center">{dayLabel(d.day)}{!d.open && <div className="font-normal text-red-600">سكّر الطلب</div>}</th>)}
          </tr></thead>
          <tbody className="divide-y">
            {data.meals.filter((m) => m.isAvailable).map((m) => (
              <tr key={m.id}>
                <td className="px-2 py-1"><div className="font-medium">{m.nameAr}</div><div className="text-[11px] text-muted-foreground">{names.get(m.kitchenId)}</div></td>
                {data.days.map((d) => { const c = map.get(`${m.id}|${d.day}`); return <PortionCell key={d.day} mealId={m.id} day={d.day} portions={c?.portions ?? 0} sold={c?.sold ?? 0} />; })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function OrdersCard({ data }: { data: KitchenOverview }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [day, setDay] = useState(data.days[0]?.day ?? "");
  const { data: res } = useQuery({ queryKey: ["admin", "kitchen", "orders", day], queryFn: () => api.get<KitchenDayOrders>(`/admin/kitchen/orders?day=${day}`), enabled: !!day, refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/admin/kitchen/orders/${id}/cancel`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "kitchen"] }); toast({ title: "انلغى الطلب ورجعت الحصص" }); },
    onError: () => toast({ title: "ما انلغى (ممكن الطلب طلع للمندوب)", variant: "destructive" }),
  });
  const counts = new Map(data.upcoming.map((u) => [u.day, u.orders]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>الطلبات المسبقة · {num(data.upcoming.reduce((a, u) => a + u.orders, 0))} طلب جاي · {num(data.subscriptions.active)} اشتراك شغّال</CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          {data.days.map((d) => (
            <Button key={d.day} size="sm" variant={d.day === day ? "default" : "outline"} onClick={() => setDay(d.day)}>
              {dayLabel(d.day)}{counts.get(d.day) ? ` (${num(counts.get(d.day)!)})` : ""}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {res && res.summaries.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {res.summaries.map((s) => (
              <div key={s.kitchenId} className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-bold">{s.kitchenName} · {num(s.orders)} طلب</div>
                <ul className="mt-1">{s.lines.map((l) => <li key={l.nameAr}>{l.nameAr} × <b>{num(l.qty)}</b></li>)}</ul>
                <div className="mt-1 text-xs text-muted-foreground">{s.byWindow.map((w) => `${windowLabel(w.window)}: ${num(w.orders)}`).join(" · ")}</div>
              </div>
            ))}
          </div>
        )}
        {!res ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : res.orders.length === 0 ? <p className="text-sm text-muted-foreground">ما في طلبات لهاليوم.</p> : (
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/50 text-xs"><tr>
              <th className="px-2 py-2 text-right">الموعد</th><th className="px-2 py-2 text-right">الطلب</th><th className="px-2 py-2 text-right">الزبون</th>
              <th className="px-2 py-2 text-right">العنوان</th><th className="px-2 py-2 text-right">المبلغ</th><th className="px-2 py-2 text-right">الحالة</th><th></th>
            </tr></thead>
            <tbody className="divide-y">
              {res.orders.map((o) => (
                <tr key={o.id} className={o.status === "cancelled" ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap px-2 py-1.5 font-bold">{windowLabel(o.window ?? "")}</td>
                  <td className="px-2 py-1.5">{o.orderText}{o.subscriptionId && <span className="ms-2 rounded-full bg-purple-100 px-2 text-[11px] font-bold text-purple-800">اشتراك</span>}</td>
                  <td className="px-2 py-1.5">{o.customerName ?? "—"}<div className="font-mono text-[11px] text-muted-foreground" dir="ltr">{o.customerPhone}</div></td>
                  <td className="px-2 py-1.5 text-xs">{o.address}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{num((o.totalPrice ?? 0) + (o.deliveryFee ?? 0))} ل.س</td>
                  <td className="px-2 py-1.5 text-xs">{o.status === "scheduled" ? "مجدول" : o.status === "cancelled" ? "ملغي" : o.status === "delivered" ? "تسلّم" : "عند المناديب"}</td>
                  <td className="px-2 py-1.5">{o.status === "scheduled" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={cancel.isPending}
                      onClick={() => { if (confirm("تلغي هالطلب المسبق؟ الزبون بيوصله إشعار.")) cancel.mutate(o.id); }}>إلغاء</Button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default function Kitchen() {
  const { data, isLoading, isError } = useOverview();
  if (isLoading) return <p className="text-muted-foreground">جارٍ التحميل…</p>;
  if (isError || !data) return <p className="text-destructive">تعذّر تحميل القسم.</p>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">🍲 {data.settings.title}</h1>
        <p className="text-sm text-muted-foreground">طبخ بيت ووجبات صحية بالطلب المسبق: الزبون بيطلب اليوم لبكرا أو باشتراك أسبوعي، والحصص معدودة.</p>
      </div>
      <SettingsCard data={data} />
      <KitchensCard data={data} />
      <MealsCard data={data} />
      <PortionsCard data={data} />
      <OrdersCard data={data} />
    </div>
  );
}
