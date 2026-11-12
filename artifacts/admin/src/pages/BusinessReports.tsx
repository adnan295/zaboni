import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CourierEconomicsRow, type CourierVerdict, type RestaurantSalesRow, type SpeedVerdict } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const PERIODS = [
  { label: "٧ أيام", value: 7 },
  { label: "١٤ يوم", value: 14 },
  { label: "٣٠ يوم", value: 30 },
  { label: "٩٠ يوم", value: 90 },
];

const syp = (n: number) => `${Math.round(n).toLocaleString("ar-SY")} ل.س`;
const num = (n: number) => n.toLocaleString("ar-SY");
const pct = (f: number | null) => (f == null ? "—" : `${Math.round(f * 100)}٪`);

const VERDICT: Record<CourierVerdict, { label: string; cls: string; order: number }> = {
  losing: { label: "الباقة أغلى من شغلو", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", order: 0 },
  marginal: { label: "بالكاد غطّى الاشتراك", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", order: 1 },
  inactive: { label: "دافع وما عم يشتغل", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200", order: 2 },
  no_subscription: { label: "يوصّل بلا اشتراك", cls: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300", order: 3 },
  profitable: { label: "الباقة رابحة إلو", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", order: 4 },
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "green" | "amber" }) {
  const t = tone === "red" ? "text-red-600" : tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${t}`}>{value}</div>
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function CouriersTab({ days }: { days: number }) {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "reports", "courier-economics", days], queryFn: () => api.getCourierEconomics(days) });
  const [filter, setFilter] = useState<CourierVerdict | "all">("all");
  const rows = useMemo(() => {
    const list = (data?.couriers ?? []).filter((c) => filter === "all" ? c.subscriptionCost > 0 || c.deliveries > 0 || c.plan : c.verdict === filter);
    return [...list].sort((a, b) => VERDICT[a.verdict].order - VERDICT[b.verdict].order || b.earnings - a.earnings);
  }, [data, filter]);
  if (isLoading || !data) return <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل…</div>;
  const t = data.totals;
  const margin = t.subscriptionRevenue;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="إيراد الاشتراكات بالفترة" value={syp(margin)} sub={`${num(t.subscribed)} مندوب عندو اشتراك فعّال هلق`} tone="green" />
        <Stat label="ربح المناديب من التوصيل" value={syp(t.courierEarnings)} sub={`${num(t.deliveries)} توصيلة`} />
        <Stat label="ساعات العمل الكلّية" value={`${num(t.onlineHours)} ساعة`} sub={t.onlineHours > 0 ? `${(t.deliveries / Math.max(1, t.onlineHours)).toFixed(1)} توصيلة بالساعة` : "بيبدأ التسجيل من هلق"} />
        <Stat label="مهدَّدين ما يجدّدوا" value={num(t.renewalRisk)} sub="اشتراكهم بيخلص خلال أسبوع وما ربحوا منو" tone={t.renewalRisk > 0 ? "red" : "green"} />
      </div>

      {!data.hasActivityData && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⏳ ساعات العمل ونسبة القبول بلّشت تتسجّل من تاريخ نشر هالتحديث. الأرقام بتتعبّى مع الأيام الجاية، أما الاشتراكات والتوصيلات والأرباح فمحسوبة من البيانات القديمة.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>الكل ({num(rows.length)})</Button>
        {(Object.keys(VERDICT) as CourierVerdict[]).sort((a, b) => VERDICT[a].order - VERDICT[b].order).map((v) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} onClick={() => setFilter(v)}>
            {VERDICT[v].label} ({num(t.byVerdict[v])})
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="text-right">
                <th className="p-3 font-medium">المندوب</th>
                <th className="p-3 font-medium">الحكم</th>
                <th className="p-3 font-medium">الباقة</th>
                <th className="p-3 font-medium">دفع</th>
                <th className="p-3 font-medium">ربح</th>
                <th className="p-3 font-medium">العائد</th>
                <th className="p-3 font-medium">توصيلات</th>
                <th className="p-3 font-medium">ساعات</th>
                <th className="p-3 font-medium">عروض / قبول</th>
                <th className="p-3 font-medium">تقييم</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => <CourierRow key={c.id} c={c} />)}
              {rows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">ما في مناديب بهالتصنيف</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        «دفع» = قيمة اشتراكه محسوبة على الجزء يلي بيقع ضمن الفترة فقط (اشتراك شهري بفترة ٧ أيام = ٧/٣٠ من قيمته). «العائد» = ربحه ÷ ما دفعه. الاشتراكات المهداة ما بتنحسب إيراد.
      </p>
    </div>
  );
}

function CourierRow({ c }: { c: CourierEconomicsRow }) {
  const v = VERDICT[c.verdict];
  return (
    <tr className="border-t align-top">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${c.isOnline ? "bg-green-500" : "bg-slate-300"}`} />
          <div>
            <div className="font-bold">{c.name || "بدون اسم"}</div>
            <a href={`tel:${c.phone}`} dir="ltr" className="text-xs text-muted-foreground underline">{c.phone}</a>
          </div>
        </div>
      </td>
      <td className="p-3">
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>
        <div className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">{c.verdictReason}</div>
      </td>
      <td className="p-3 text-xs">
        {c.plan ? (
          <>
            <div className="font-medium">{c.plan.name}</div>
            <div className={c.plan.daysLeft <= 3 ? "font-bold text-red-600" : "text-muted-foreground"}>باقي {num(c.plan.daysLeft)} يوم</div>
          </>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="p-3 tabular-nums">{c.subscriptionCost > 0 ? syp(c.subscriptionCost) : "—"}</td>
      <td className="p-3 tabular-nums font-medium">{syp(c.earnings)}</td>
      <td className="p-3 tabular-nums">
        {c.returnRatio == null ? "—" : <span className={c.returnRatio < 1 ? "font-bold text-red-600" : c.returnRatio < 2 ? "text-amber-700" : "font-bold text-green-700"}>{c.returnRatio.toFixed(1)}×</span>}
      </td>
      <td className="p-3 tabular-nums">
        {num(c.deliveries)}
        {c.cancelledAfterAccept > 0 && <div className="text-[11px] text-red-600">{num(c.cancelledAfterAccept)} ألغى بعد القبول</div>}
      </td>
      <td className="p-3 tabular-nums">
        {c.onlineHours > 0 ? (
          <>
            {c.onlineHours.toLocaleString("ar-SY")} س
            <div className="text-[11px] text-muted-foreground">{num(c.activeDays)} يوم{c.earningsPerOnlineHour != null && ` · ${syp(c.earningsPerOnlineHour)}/س`}</div>
          </>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="p-3 tabular-nums">
        {c.offers > 0 ? (
          <>
            {num(c.accepted)} / {num(c.offers)}
            <div className={`text-[11px] ${c.acceptanceRate != null && c.acceptanceRate < 0.3 ? "font-bold text-red-600" : "text-muted-foreground"}`}>قبل {pct(c.acceptanceRate)}</div>
          </>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="p-3 tabular-nums">{c.avgRating == null ? "—" : `⭐ ${c.avgRating}`}</td>
    </tr>
  );
}

function RestaurantsTab({ days }: { days: number }) {
  const [commission, setCommission] = useState(10);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reports", "restaurant-sales", days, commission],
    queryFn: () => api.getRestaurantSales(days, commission),
  });
  if (isLoading || !data) return <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل…</div>;
  const t = data.totals;
  const active = data.restaurants.filter((r) => r.orders > 0);
  const quiet = data.restaurants.filter((r) => r.orders === 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="مبيعات المطاعم عبر زبوني" value={syp(t.gmv)} sub={`${num(t.delivered)} طلب مسلّم من ${num(t.activeRestaurants)} مطعم`} tone="green" />
        <Stat label="متوسط الطلب" value={t.delivered > 0 ? syp(t.gmv / t.delivered) : "—"} />
        <Stat label="رسوم التوصيل" value={syp(t.deliveryFees)} sub="بتروح للمناديب" />
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">لو أخدنا عمولة</div>
            <div className="mt-1 flex items-center gap-2">
              <Input type="number" min={0} max={50} value={commission} onChange={(e) => setCommission(Math.min(50, Math.max(0, Number(e.target.value) || 0)))} className="h-9 w-20 text-center" />
              <span className="text-sm">٪ =</span>
              <span className="text-xl font-bold tabular-nums text-green-700">{syp(t.commissionAt)}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">محاكاة فقط، ما بتغيّر شي</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">المطاعم حسب المبيعات</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="text-right">
                <th className="p-3 font-medium">#</th>
                <th className="p-3 font-medium">المطعم</th>
                <th className="p-3 font-medium">مبيعات</th>
                <th className="p-3 font-medium">عن الفترة الماضية</th>
                <th className="p-3 font-medium">طلبات مسلّمة</th>
                <th className="p-3 font-medium">متوسط الطلب</th>
                <th className="p-3 font-medium">زبائن</th>
                <th className="p-3 font-medium">إلغاء</th>
                <th className="p-3 font-medium">تقييم</th>
                <th className="p-3 font-medium">عمولة {commission}٪</th>
              </tr>
            </thead>
            <tbody>
              {active.map((r, i) => <RestaurantRow key={r.id} r={r} rank={i + 1} />)}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {quiet.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base text-muted-foreground">بلا ولا طلب بهالفترة ({num(quiet.length)})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {quiet.map((r) => <Badge key={r.id} variant="outline" className={r.isOpen ? "" : "opacity-50"}>{r.nameAr}{!r.isOpen && " · مسكّر"}</Badge>)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RestaurantRow({ r, rank }: { r: RestaurantSalesRow; rank: number }) {
  return (
    <tr className="border-t">
      <td className="p-3 text-muted-foreground">{num(rank)}</td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          {r.image && <img src={r.image} alt="" className="h-8 w-8 rounded-md object-cover" loading="lazy" />}
          <span className="font-bold">{r.nameAr}</span>
          {!r.isOpen && <Badge variant="outline" className="text-[10px]">مسكّر</Badge>}
        </div>
      </td>
      <td className="p-3 tabular-nums font-medium">{syp(r.gmv)}</td>
      <td className="p-3 tabular-nums">
        {r.gmvChange == null ? <span className="text-muted-foreground">جديد</span>
          : <span className={r.gmvChange >= 0 ? "text-green-700" : "text-red-600"}>{r.gmvChange >= 0 ? "▲" : "▼"} {Math.abs(Math.round(r.gmvChange * 100))}٪</span>}
      </td>
      <td className="p-3 tabular-nums">{num(r.delivered)}</td>
      <td className="p-3 tabular-nums">{r.avgTicket == null ? "—" : syp(r.avgTicket)}</td>
      <td className="p-3 tabular-nums">{num(r.customers)}</td>
      <td className="p-3 tabular-nums">
        <span className={r.cancellationRate != null && r.cancellationRate > 0.2 ? "font-bold text-red-600" : ""}>{pct(r.cancellationRate)}</span>
      </td>
      <td className="p-3 tabular-nums">{r.avgRating == null ? "—" : `⭐ ${r.avgRating}`}</td>
      <td className="p-3 tabular-nums text-green-700">{syp(r.commissionAt)}</td>
    </tr>
  );
}

const SPEED: Record<SpeedVerdict, { label: string; cls: string }> = {
  slow: { label: "بطيء", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  normal: { label: "عادي", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  fast: { label: "سريع", cls: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  few_orders: { label: "طلبات قليلة", cls: "bg-muted text-muted-foreground" },
};
const mins = (n: number | null) => (n == null ? "—" : `${num(n)} د`);

function SpeedBadge({ v }: { v: SpeedVerdict }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SPEED[v].cls}`}>{SPEED[v].label}</span>;
}

/** Who is slow and who is fast, measured from the real order timeline. Slowest first. */
function SpeedTab({ days }: { days: number }) {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "reports", "speed", days], queryFn: () => api.getSpeedReport(days) });
  if (isLoading || !data) return <p className="text-muted-foreground">جارٍ التحميل…</p>;
  if (data.orders === 0) return <p className="text-muted-foreground">ما في طلبات مسلّمة بهالفترة لنقيس عليها.</p>;
  const o = data.overall;
  const slowRestaurants = data.restaurants.filter((r) => r.verdict === "slow").length;
  const slowCouriers = data.couriers.filter((c) => c.verdict === "slow").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="انتظار مندوب" value={mins(o.avgWaitMinutes)} sub="من الطلب لقبول المندوب" />
        <Stat label="الاستلام من المطعم" value={mins(o.avgPickupMinutes)} sub="من القبول للاستلام" />
        <Stat label="الطريق للزبون" value={mins(o.avgRideMinutes)} sub="من الاستلام للتسليم" />
        <Stat label="من القبول للتسليم" value={mins(o.avgDeliveryMinutes)} sub="شغل المندوب كامل" />
        <Stat label="الكلي عند الزبون" value={mins(o.avgTotalMinutes)} sub={`متوسط ${num(data.orders)} طلب مسلّم`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">🍽️ المطاعم · الأبطأ أولاً {slowRestaurants > 0 && <span className="text-sm font-normal text-red-600">({num(slowRestaurants)} بطيء)</span>}</CardTitle>
            <p className="text-xs text-muted-foreground">الوقت من قبول المندوب لحد ما يستلم الطلب: مشواره للمطعم وانتظاره للأكل. المطعم البطيء بيعلّق المندوب وبيأخّر الزبون.</p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/50 text-xs">
                <tr><th className="px-3 py-2 text-right">المطعم</th><th className="px-3 py-2 text-right">طلبات</th><th className="px-3 py-2 text-right">متوسط الاستلام</th><th className="px-3 py-2 text-right">أسوأ مرة</th><th className="px-3 py-2 text-right">الكلي للزبون</th><th className="px-3 py-2 text-right">الحكم</th></tr>
              </thead>
              <tbody className="divide-y">
                {data.restaurants.map((r) => (
                  <tr key={r.name}>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 tabular-nums">{num(r.orders)}</td>
                    <td className={`px-3 py-2 font-bold tabular-nums ${r.verdict === "slow" ? "text-red-600" : r.verdict === "fast" ? "text-green-700" : ""}`}>{mins(r.avgPickupMinutes)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{mins(r.slowestPickupMinutes)}</td>
                    <td className="px-3 py-2 tabular-nums">{mins(r.avgTotalMinutes)}</td>
                    <td className="px-3 py-2"><SpeedBadge v={r.verdict} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">🛵 المناديب · الأبطأ أولاً {slowCouriers > 0 && <span className="text-sm font-normal text-red-600">({num(slowCouriers)} بطيء)</span>}</CardTitle>
            <p className="text-xs text-muted-foreground">الحكم على وقت الطريق بس (من الاستلام للتسليم) لحتى ما ينظلم المندوب بسبب مطعم بطيء.</p>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/50 text-xs">
                <tr><th className="px-3 py-2 text-right">المندوب</th><th className="px-3 py-2 text-right">توصيلات</th><th className="px-3 py-2 text-right">متوسط الطريق</th><th className="px-3 py-2 text-right">من القبول للتسليم</th><th className="px-3 py-2 text-right">أسوأ مرة</th><th className="px-3 py-2 text-right">الحكم</th></tr>
              </thead>
              <tbody className="divide-y">
                {data.couriers.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2"><div className="font-medium">{c.name || "—"}</div><div className="font-mono text-[11px] text-muted-foreground" dir="ltr">{c.phone}</div></td>
                    <td className="px-3 py-2 tabular-nums">{num(c.deliveries)}</td>
                    <td className={`px-3 py-2 font-bold tabular-nums ${c.verdict === "slow" ? "text-red-600" : c.verdict === "fast" ? "text-green-700" : ""}`}>{mins(c.avgRideMinutes)}</td>
                    <td className="px-3 py-2 tabular-nums">{mins(c.avgDeliveryMinutes)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{mins(c.slowestDeliveryMinutes)}</td>
                    <td className="px-3 py-2"><SpeedBadge v={c.verdict} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        "بطيء" = أبطأ من متوسط الكل بربع أو أكثر، و"سريع" = أسرع بخُمس أو أكثر. اللي عندو أقل من ٥ طلبات ما منحكم عليه. الخطوات اللي أطول من ٣ ساعات (نسي يكبس الزر) ما بتنحسب.
      </p>
    </div>
  );
}

export default function BusinessReports() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<"couriers" | "restaurants" | "speed">("couriers");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold">📈 تقارير القرار</h1>
        {PERIODS.map((p) => (
          <Button key={p.value} size="sm" variant={days === p.value ? "default" : "outline"} onClick={() => setDays(p.value)}>{p.label}</Button>
        ))}
      </div>
      <div className="flex gap-2 border-b">
        {([["couriers", "🛵 اقتصاد المناديب"], ["restaurants", "🍽️ مبيعات المطاعم"], ["speed", "⏱ السرعة والجودة"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "couriers" ? <CouriersTab days={days} /> : tab === "restaurants" ? <RestaurantsTab days={days} /> : <SpeedTab days={days} />}
    </div>
  );
}
