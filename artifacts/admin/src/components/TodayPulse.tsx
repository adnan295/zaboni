import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, type DayNumbers } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

const num = (n: number) => n.toLocaleString("ar-SY");
const syp = (n: number) => `${Math.round(n).toLocaleString("ar-SY")} ل.س`;

/** "vs yesterday" delta as a coloured chip. `invert` for metrics where lower is better. */
function Delta({ now, then, label, invert = false }: { now: number; then: number; label: string; invert?: boolean }) {
  if (then === 0 && now === 0) return <span className="text-[11px] text-muted-foreground">{label}: —</span>;
  const diff = now - then;
  const good = invert ? diff <= 0 : diff >= 0;
  const text = then === 0 ? `+${num(now)}` : `${diff >= 0 ? "+" : "−"}${Math.round(Math.abs(diff / then) * 100)}٪`;
  return (
    <span className={`text-[11px] font-medium ${diff === 0 ? "text-muted-foreground" : good ? "text-green-700" : "text-red-600"}`}>
      {label}: {diff === 0 ? "=" : text}
    </span>
  );
}

function Metric({ label, value, today, yesterday, lastWeek, pick, money, invert, hint }: {
  label: string; value: string; today: DayNumbers; yesterday: DayNumbers; lastWeek: DayNumbers;
  pick: (d: DayNumbers) => number; money?: boolean; invert?: boolean; hint?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-0.5 font-bold tabular-nums ${money ? "text-xl" : "text-3xl"}`}>{value}</div>
        <div className="mt-1 flex flex-col gap-0.5">
          <Delta now={pick(today)} then={pick(yesterday)} label="عن أمس" invert={invert} />
          <Delta now={pick(today)} then={pick(lastWeek)} label="عن نفس اليوم الماضي" invert={invert} />
        </div>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** Today's numbers vs yesterday and the same weekday last week, plus what needs a hand right now. */
export default function TodayPulse() {
  const { data } = useQuery({ queryKey: ["admin", "today"], queryFn: api.getToday, refetchInterval: 30_000 });
  if (!data) return null;
  const { today: t, yesterday: y, lastWeek: w, now, yesterdaySameTime: ys } = data;
  const hour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Damascus" });
  const peak = data.hourly.indexOf(Math.max(...data.hourly));

  const attention: { text: string; href: string; tone: "red" | "amber" }[] = [];
  if (now.stuck > 0) attention.push({ text: `${num(now.stuck)} طلب عالق بلا مندوب`, href: "/orders", tone: "red" });
  if (now.searching > 0 && now.couriersOnline === 0) attention.push({ text: "في طلبات عم تدوّر وما في ولا مندوب متصل", href: "/couriers", tone: "red" });
  if (now.pendingSubscriptionRequests > 0) attention.push({ text: `${num(now.pendingSubscriptionRequests)} طلب اشتراك مندوب بانتظار الموافقة (فلوس واقفة)`, href: "/subscription-requests", tone: "amber" });
  if (now.pendingCourierApplications > 0) attention.push({ text: `${num(now.pendingCourierApplications)} مندوب جديد بدو موافقة للانضمام`, href: "/courier-applications", tone: "amber" });
  if (now.subscriptionsEndingSoon > 0) attention.push({ text: `${num(now.subscriptionsEndingSoon)} اشتراك بيخلص خلال ٣ أيام — ذكّرهم يجدّدوا`, href: "/reports", tone: "amber" });
  if (now.openSupportTickets > 0) attention.push({ text: `${num(now.openSupportTickets)} تذكرة دعم مفتوحة`, href: "/customer-support", tone: "amber" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">اليوم · {data.date}</h2>
          <p className="text-xs text-muted-foreground">
            الساعة {hour} بتوقيت دمشق · أمس بنفس هالوقت كان في {num(ys.orders)} طلب
            {t.orders !== ys.orders && (
              <span className={t.orders > ys.orders ? " text-green-700" : " text-red-600"}> ({t.orders > ys.orders ? "متقدّمين" : "متأخرين"} بـ {num(Math.abs(t.orders - ys.orders))})</span>
            )}
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="rounded-full bg-muted px-3 py-1">🛵 {num(now.couriersOnline)} مندوب متصل</span>
          <span className="rounded-full bg-muted px-3 py-1">🔎 {num(now.searching)} عم يدوّر</span>
          <span className="rounded-full bg-muted px-3 py-1">🚚 {num(now.inProgress)} بالطريق</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="طلبات اليوم" value={num(t.orders)} today={t} yesterday={y} lastWeek={w} pick={(d) => d.orders}
          hint={t.orders > 0 ? `${num(t.delivered)} مسلّم · ${num(t.cancelled)} ملغى` : undefined} />
        <Metric label="مبيعات المطاعم اليوم" value={syp(t.gmv)} money today={t} yesterday={y} lastWeek={w} pick={(d) => d.gmv}
          hint={t.delivered > 0 ? `متوسط الطلب ${syp(t.gmv / t.delivered)}` : undefined} />
        <Metric label="زبائن جدد اليوم" value={num(t.newCustomers)} today={t} yesterday={y} lastWeek={w} pick={(d) => d.newCustomers}
          hint={`أول طلب إلهم · ${num(t.returningCustomers)} زبون راجع`} />
        <Metric label="اشتراكات مناديب اليوم" value={num(t.subscriptions)} today={t} yesterday={y} lastWeek={w} pick={(d) => d.subscriptions}
          hint={t.subscriptionRevenue > 0 ? syp(t.subscriptionRevenue) : "ما في اشتراك مدفوع اليوم"} />
        <Metric label="مناديب وصّلوا اليوم" value={num(t.activeCouriers)} today={t} yesterday={y} lastWeek={w} pick={(d) => d.activeCouriers}
          hint={t.activeCouriers > 0 ? `${(t.delivered / t.activeCouriers).toFixed(1)} توصيلة للمندوب` : undefined} />
        <Metric label="نسبة الإلغاء اليوم" value={t.orders > 0 ? `${Math.round((t.cancelled / t.orders) * 100)}٪` : "—"} invert
          today={t} yesterday={y} lastWeek={w} pick={(d) => (d.orders > 0 ? Math.round((d.cancelled / d.orders) * 100) : 0)}
          hint={peak >= 0 && data.hourly[peak]! > 0 ? `ذروة اليوم الساعة ${peak}:00 (${num(data.hourly[peak]!)} طلب)` : undefined} />
      </div>

      {attention.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-bold">👋 بدها إيدك هلق</div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className={`flex items-center gap-2 text-sm hover:underline ${a.tone === "red" ? "font-bold text-red-700 dark:text-red-400" : ""}`}>
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${a.tone === "red" ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
                    {a.text} ←
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
