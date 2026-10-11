import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api, type LostReason, type SearchWait, type WaitSettings } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const PERIODS = [
  { value: 7, label: "٧ أيام" },
  { value: 30, label: "٣٠ يوم" },
  { value: 90, label: "٩٠ يوم" },
  { value: 0, label: "الكل" },
] as const;

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--popover-foreground)",
};

const LOST_REASON: Record<LostReason, { icon: string; label: string; hint: string; tone: string }> = {
  no_couriers: {
    icon: "🚫",
    label: "ما في مندوب متاح",
    hint: "كل المناديب كانوا مسكّرين أو مشغولين — بدها مناديب أكتر بهالوقت",
    tone: "text-red-600",
  },
  not_accepted: {
    icon: "🙈",
    label: "وصلهن وما حدا قبل",
    hint: "الإشعار وصل لمناديب ورفضوا أو طنّشوا — شوف الرسوم والمسافة",
    tone: "text-orange-600",
  },
  push_failed: {
    icon: "📵",
    label: "الإشعار ما انبعت",
    hint: "في مناديب متاحين بس الإشعار انرفض — مشكلة تقنية",
    tone: "text-purple-600",
  },
  unknown: {
    icon: "❔",
    label: "غير معروف",
    hint: "طلبات قبل ما نبلّش نسجّل هالمعلومة",
    tone: "text-muted-foreground",
  },
};

function WaitSettingsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin", "wait-settings"], queryFn: api.getWaitSettings });
  const save = useMutation({
    mutationFn: (next: Omit<WaitSettings, "apologyLast30Days">) => api.updateWaitSettings(next),
    onSuccess: (res) => {
      queryClient.setQueryData(["admin", "wait-settings"], res);
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders", "stuck"] });
      toast({ title: "انحفظت الإعدادات" });
    },
    onError: () => toast({ title: "ما انحفظت الإعدادات", variant: "destructive" }),
  });
  if (!data) return null;
  const base = {
    searchAlertMinutes: data.searchAlertMinutes,
    nudgeEnabled: data.nudgeEnabled,
    apologyEnabled: data.apologyEnabled,
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">⚙️ لا تخسر الزبون وهو عم يستنّى</p>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">بعد كم دقيقة بحث:</span>
          <select
            value={data.searchAlertMinutes}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ ...base, searchAlertMinutes: Number(e.target.value) })}
            className="rounded-md border bg-background px-2 py-1"
          >
            {[2, 3, 4, 5, 7, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m} د
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={data.nudgeEnabled}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ ...base, nudgeEnabled: e.target.checked })}
          />
          <span>
            رسالة طمأنة للزبون
            <span className="block text-xs text-muted-foreground">"المناديب مشغولين شوي، خليك معنا"</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={data.apologyEnabled}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ ...base, apologyEnabled: e.target.checked })}
          />
          <span>
            كود اعتذار تلقائي إذا ألغى
            <span className="block text-xs text-muted-foreground">
              توصيل مجاني لطلبه الجاي (٧ أيام، مرة بالشهر للزبون) · آخر ٣٠ يوم: انبعت{" "}
              {data.apologyLast30Days.issued.toLocaleString("ar-SY")}، انستخدم{" "}
              {data.apologyLast30Days.used.toLocaleString("ar-SY")}
            </span>
          </span>
        </label>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        نفس المدة بتشغّل تنبيه الإدارة ⏳ (بكل الصفحات) ورسالة الطمأنة، وما بينبعت كود اعتذار إلا لمين استنّى هالمدة أو أكتر.
      </p>
    </div>
  );
}

const mins = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("ar-SY")} د`);

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SY", {
    timeZone: "Asia/Damascus",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function waitTone(min: number) {
  if (min >= 20) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (min >= 10) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  if (min >= 5) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-muted text-muted-foreground";
}

function StatBox({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Plain-language takeaways computed from the numbers, so the admin doesn't have to read the charts. */
function insights(d: SearchWait): string[] {
  const out: string[] = [];
  const s = d.summary;
  if (s.medianGiveUpMinutes != null) {
    out.push(`نص الزباين يلي بيلغوا بيستسلموا بعد ${mins(s.medianGiveUpMinutes)} من الانتظار تقريباً.`);
  }
  if (s.medianAcceptMinutes != null && s.p90AcceptMinutes != null) {
    out.push(
      `الطلب العادي بيلاقي مندوب خلال ${mins(s.medianAcceptMinutes)}، بس ١٠٪ من الطلبات بتستنى أكتر من ${mins(s.p90AcceptMinutes)}.`,
    );
  }
  if (
    s.medianGiveUpMinutes != null &&
    s.p90AcceptMinutes != null &&
    s.p90AcceptMinutes > s.medianGiveUpMinutes
  ) {
    out.push(
      `⚠️ في طلبات عم تاخد وقت أطول من صبر الزبون (${mins(s.p90AcceptMinutes)} مقابل ${mins(s.medianGiveUpMinutes)}) — هون عم نخسر.`,
    );
  }
  const worst = [...d.byHour]
    .filter((h) => h.orders >= 3 && h.gaveUp > 0)
    .sort((a, b) => b.gaveUpRate - a.gaveUpRate)
    .slice(0, 3);
  if (worst.length > 0) {
    out.push(
      `أسوأ الساعات (أعلى نسبة استسلام): ${worst
        .map((h) => `${String(h.hour).padStart(2, "0")}:00 (${h.gaveUpRate}٪)`)
        .join("، ")} — غالباً ما في مناديب كفاية بهالأوقات.`,
    );
  }
  const reasons = (Object.entries(s.byLostReason) as [LostReason, number][])
    .filter(([k]) => k !== "unknown")
    .sort((a, b) => b[1] - a[1]);
  const top = reasons[0];
  if (top && top[1] > 0) {
    const advice: Record<LostReason, string> = {
      no_couriers: "يعني المشكلة بعدد المناديب الشغّالين بهالأوقات، مو بالتطبيق.",
      not_accepted: "يعني في مناديب بس ما عم يقبلوا — راجع رسوم التوصيل والمسافات.",
      push_failed: "يعني في مشكلة بوصول الإشعارات للمناديب.",
      unknown: "",
    };
    out.push(`أكتر سبب للضياع: ${LOST_REASON[top[0]].label} (${top[1]} طلب) — ${advice[top[0]]}`);
  }
  if (s.neverServedCustomers > 0) {
    out.push(
      `${s.neverServedCustomers.toLocaleString("ar-SY")} زبون ما وصله ولا طلب أبداً — أول تجربة إلهن كانت انتظار وإلغاء.`,
    );
  }
  return out;
}

export default function SearchWaitPanel() {
  const { toast } = useToast();
  const [days, setDays] = useState<7 | 30 | 90 | 0>(30);
  const [excludeFake, setExcludeFake] = useState(true);
  const [customerTab, setCustomerTab] = useState<"lost" | "returned">("lost");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "search-wait", days, excludeFake],
    queryFn: () => api.getSearchWait(days, excludeFake),
    staleTime: 60_000,
  });

  const customers = useMemo(
    () => (data?.customers ?? []).filter((c) => c.status === customerTab),
    [data, customerTab],
  );

  const hourData =
    data?.byHour.map((h) => ({
      hour: `${String(h.hour).padStart(2, "0")}`,
      "طلبات": h.orders,
      "استسلم وألغى": h.gaveUp,
    })) ?? [];

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                days === p.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={excludeFake} onChange={(e) => setExcludeFake(e.target.checked)} />
          استبعد الحسابات الوهمية المحتملة
          {data && data.excludeFake && data.excludedAccounts > 0 && (
            <span className="text-xs">({data.excludedAccounts.toLocaleString("ar-SY")} حساب)</span>
          )}
        </label>
      </div>

      <WaitSettingsCard />

      {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">جارٍ التحليل…</div>}
      {isError && <div className="py-16 text-center text-sm text-destructive">فشل تحميل البيانات</div>}

      {data && s && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatBox
              label="استسلموا قبل ما يلاقوا مندوب"
              value={s.gaveUpOrders.toLocaleString("ar-SY")}
              sub={`${s.gaveUpRate}٪ من ${s.totalOrders.toLocaleString("ar-SY")} طلب`}
              tone={s.gaveUpRate >= 15 ? "text-red-600" : s.gaveUpRate >= 7 ? "text-orange-600" : ""}
            />
            <StatBox
              label="صبر الزبون (متوسط)"
              value={mins(s.medianGiveUpMinutes)}
              sub="بعد قديش بيلغي يلي ما لاقى مندوب"
            />
            <StatBox
              label="وقت إيجاد مندوب"
              value={mins(s.medianAcceptMinutes)}
              sub={`عادةً — و١٠٪ من الطلبات أكتر من ${mins(s.p90AcceptMinutes)}`}
            />
            <StatBox
              label="زباين خسرناهن"
              value={s.lostCustomers.toLocaleString("ar-SY")}
              sub={`ألغوا وما رجعوا · ${s.returnedCustomers.toLocaleString("ar-SY")} رجعوا وطلبوا`}
              tone={s.lostCustomers > 0 ? "text-red-600" : ""}
            />
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">🔍 ليش ما لاقوا مندوب؟</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(Object.keys(LOST_REASON) as LostReason[]).map((k) => (
                <div key={k} title={LOST_REASON[k].hint} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {LOST_REASON[k].icon} {LOST_REASON[k].label}
                  </p>
                  <p className={`mt-1 text-xl font-bold ${LOST_REASON[k].tone}`}>
                    {s.byLostReason[k].toLocaleString("ar-SY")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{LOST_REASON[k].hint}</p>
                </div>
              ))}
            </div>
          </div>

          {insights(data).length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
              <p className="mb-2 text-sm font-semibold">💡 شو بتقول الأرقام</p>
              <ul className="space-y-1 text-sm">
                {insights(data).map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="mb-1 font-semibold">قديش استنّوا؟</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                🔴 يلي استسلموا (بعد قديش ألغوا) مقابل 🟢 يلي لاقوا مندوب (بعد قديش انقبل طلبهن)
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.buckets} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="gaveUp" name="استسلم وألغى" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="accepted" name="لاقى مندوب" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="mb-1 font-semibold">حسب ساعة الطلب</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                توقيت سوريا — الساعات يلي فيها أحمر كتير يعني ما في مناديب كفاية
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hourData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="طلبات" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="استسلم وألغى" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">👥 الزباين يلي ألغوا وهنن عم يستنّوا مندوب</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  جنب كل زبون: قديش استنّى قبل ما يلغي، وإذا رجع طلب بعدها ولا خسرناه
                </p>
              </div>
              <div className="flex gap-1.5">
                {([
                  ["lost", `خسرناهن (${s.lostCustomers})`],
                  ["returned", `رجعوا (${s.returnedCustomers})`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCustomerTab(key)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      customerTab === key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {customerTab === "lost" && customers.length > 0 && (
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(customers.map((c) => c.phone).join("\n"))
                        .then(() => toast({ title: "انسخت أرقام الزباين — فيك تبعتلهن كود اعتذار" }))
                    }
                    className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    📋 انسخ الأرقام
                  </button>
                )}
              </div>
            </div>
            {customers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ما في حدا بهالقسم 👌</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-right font-medium">الزبون</th>
                      <th className="px-4 py-3 text-right font-medium">قديش استنّى قبل الإلغاء</th>
                      <th className="px-4 py-3 text-right font-medium">كم مرة استسلم</th>
                      <th className="px-4 py-3 text-right font-medium">طلبات وصلته</th>
                      <th className="px-4 py-3 text-right font-medium">آخر مرة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.userId} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                            {c.phone}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${waitTone(c.avgWaitMinutes)}`}>
                            {mins(c.avgWaitMinutes)}
                          </span>
                          {c.gaveUp > 1 && (
                            <span className="mr-1 text-[11px] text-muted-foreground">أطول مرة {mins(c.maxWaitMinutes)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">{c.gaveUp.toLocaleString("ar-SY")}</td>
                        <td className="px-4 py-3 text-xs">
                          {c.delivered === 0 ? (
                            <span className="font-medium text-red-600">ولا طلب</span>
                          ) : (
                            <span className="text-green-600">{c.delivered.toLocaleString("ar-SY")}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{fmt(c.lastGaveUpAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">
                📦 كل طلب انلغى قبل ما يلاقي مندوب
                <span className="mr-2 text-sm font-normal text-muted-foreground">
                  ({data.orders.length.toLocaleString("ar-SY")})
                </span>
              </h2>
            </div>
            {data.orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ما في</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-right font-medium">وقت الطلب</th>
                      <th className="px-4 py-3 text-right font-medium">الزبون</th>
                      <th className="px-4 py-3 text-right font-medium">الطلب</th>
                      <th className="px-4 py-3 text-right font-medium">استنّى</th>
                      <th className="px-4 py-3 text-right font-medium">ليش ما لاقى مندوب</th>
                      <th className="px-4 py-3 text-right font-medium">بعدها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="whitespace-nowrap px-4 py-3 text-xs">{fmt(o.createdAt)}</td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-medium">{o.userName}</p>
                          <p className="text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                            {o.userPhone}
                          </p>
                        </td>
                        <td className="max-w-[240px] px-4 py-3 text-xs">
                          <span className="ml-1">{o.orderType === "errand" ? "🛵 حر" : "🍽️"}</span>
                          {o.summary}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${waitTone(o.waitMinutes)}`}>
                            {mins(o.waitMinutes)}
                          </span>
                          {o.cancelBy === "admin" && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">ألغته الإدارة</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`font-medium ${LOST_REASON[o.lostReason].tone}`}>
                            {LOST_REASON[o.lostReason].icon} {LOST_REASON[o.lostReason].label}
                          </span>
                          {o.lostReason === "not_accepted" && (
                            <p className="text-muted-foreground">
                              وصل لـ {o.notifiedDevices.toLocaleString("ar-SY")} جهاز
                              {o.availableCouriers != null && ` · ${o.availableCouriers.toLocaleString("ar-SY")} مندوب متاح`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {o.cameBack ? (
                            <span className="text-green-600">رجع وطلب ✓</span>
                          ) : (
                            <span className="text-red-600">ما رجع</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
