import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type OrderAuditAccount, type OrderAuditFlag, type OrderAuditOrder } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const PERIODS = [
  { value: 7, label: "٧ أيام" },
  { value: 30, label: "٣٠ يوم" },
  { value: 90, label: "٩٠ يوم" },
  { value: 0, label: "الكل" },
] as const;

const FLAGS: { key: OrderAuditFlag; icon: string; label: string; hint: string }[] = [
  { key: "suspect_account", icon: "🚩", label: "حسابات مشبوهة", hint: "كل طلبات الحسابات متوسطة أو عالية الخطورة" },
  { key: "reorder_cancel", icon: "🔁", label: "كرّر الطلب وألغاه", hint: "ألغى وطلب من جديد خلال ساعة" },
  { key: "repeat_cancel", icon: "♻️", label: "إلغاء متكرّر", hint: "الحساب ألغى مرتين أو أكتر بالفترة" },
  { key: "late_night", icon: "🌙", label: "إلغاء بالليل", hint: "انلغى بساعات الليل المحددة (توقيت سوريا)" },
  { key: "errand_cancel", icon: "🛵", label: "طلب حر ملغى", hint: "طلب حر (اطلب من أي مكان) انلغى" },
  { key: "after_courier", icon: "🚴", label: "ألغى بعد قبول المندوب", hint: "الزبون ألغى بعد ما المندوب قبل — مشوار ضايع" },
];

const FLAG_META = Object.fromEntries(FLAGS.map((f) => [f.key, f])) as Record<OrderAuditFlag, (typeof FLAGS)[number]>;

const CANCEL_BY: Record<string, string> = {
  customer: "الزبون",
  customer_after_courier: "الزبون بعد قبول المندوب",
  admin: "الإدارة",
  system: "النظام (ما حدا قبل)",
};

const RISK_STYLE = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  low: "bg-muted text-muted-foreground",
} as const;
const RISK_LABEL = { high: "وهمي محتمل", medium: "مشبوه", low: "منخفض" } as const;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

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

function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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

export default function OrderAuditPanel() {
  const { toast } = useToast();
  const [days, setDays] = useState<7 | 30 | 90 | 0>(30);
  const [lateFrom, setLateFrom] = useState(2);
  const [lateTo, setLateTo] = useState(6);
  const [activeFlag, setActiveFlag] = useState<OrderAuditFlag | "all">("all");
  const [userFilter, setUserFilter] = useState<OrderAuditAccount | null>(null);
  const [showLowRisk, setShowLowRisk] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "order-audit", days, lateFrom, lateTo],
    queryFn: () => api.getOrderAudit(days, lateFrom, lateTo),
    staleTime: 60_000,
  });

  const accounts = useMemo(
    () => (data?.accounts ?? []).filter((a) => showLowRisk || a.risk !== "low"),
    [data, showLowRisk],
  );

  const orders = useMemo(() => {
    let list: OrderAuditOrder[] = data?.orders ?? [];
    if (activeFlag !== "all") list = list.filter((o) => o.flags.includes(activeFlag));
    if (userFilter) list = list.filter((o) => o.userId === userFilter.userId);
    return list;
  }, [data, activeFlag, userFilter]);

  const copy = (text: string, msg: string) => {
    void navigator.clipboard.writeText(text).then(() => toast({ title: msg }));
  };

  const s = data?.summary;

  return (
    <div className="space-y-6">
      {/* Controls */}
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
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">🌙 ساعات الليل (توقيت سوريا): من</span>
          <select
            value={lateFrom}
            onChange={(e) => setLateFrom(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
          <span className="text-muted-foreground">لـ</span>
          <select
            value={lateTo}
            onChange={(e) => setLateTo(Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <div className="py-16 text-center text-sm text-muted-foreground">جارٍ التحليل…</div>}
      {isError && <div className="py-16 text-center text-sm text-destructive">فشل تحميل البيانات</div>}

      {data && s && (
        <>
          {/* Impact */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatBox label="إجمالي الطلبات" value={s.totalOrders.toLocaleString("ar-SY")} sub={`منها ${s.cancelled.toLocaleString("ar-SY")} ملغاة`} />
            <StatBox
              label="نسبة الإلغاء"
              value={`${s.cancelRate}٪ ← ${s.cleanCancelRate}٪`}
              sub="الحالية ← بعد استبعاد الحسابات المشبوهة"
              tone={s.cleanCancelRate < s.cancelRate ? "text-green-600" : ""}
            />
            <StatBox
              label="حسابات مشبوهة"
              value={s.suspectAccounts.toLocaleString("ar-SY")}
              sub={`منها ${s.highRiskAccounts.toLocaleString("ar-SY")} وهمي محتمل`}
              tone={s.highRiskAccounts > 0 ? "text-red-600" : ""}
            />
            <StatBox
              label="طلبات الحسابات المشبوهة"
              value={s.suspectOrders.toLocaleString("ar-SY")}
              sub={`منها ${s.suspectDelivered.toLocaleString("ar-SY")} واصلة (داخلة بالأرباح)`}
            />
          </div>

          {/* Segment chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFlag("all")}
              className={`rounded-full border px-3 py-1.5 text-sm ${activeFlag === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
            >
              كل المعزول ({s.flaggedOrders.toLocaleString("ar-SY")})
            </button>
            {FLAGS.map((f) => (
              <button
                key={f.key}
                title={f.hint}
                onClick={() => setActiveFlag(f.key)}
                className={`rounded-full border px-3 py-1.5 text-sm ${activeFlag === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
              >
                {f.icon} {f.label} ({s.byFlag[f.key].toLocaleString("ar-SY")})
              </button>
            ))}
          </div>

          {/* Accounts */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">🚩 الحسابات المشبوهة</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  مرتّبة حسب درجة الخطورة — كل سبب بيزيد الدرجة. اضغط على حساب لتشوف طلباته بس.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showLowRisk} onChange={(e) => setShowLowRisk(e.target.checked)} />
                  اعرض منخفضة الخطورة
                </label>
                <button
                  onClick={() =>
                    copy(
                      accounts.filter((a) => a.risk === "high").map((a) => a.phone).join("\n"),
                      "انسخت أرقام الحسابات الوهمية المحتملة",
                    )
                  }
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  📋 انسخ أرقام "وهمي محتمل"
                </button>
                <button
                  onClick={() =>
                    downloadCsv(
                      `suspect-accounts-${new Date().toISOString().slice(0, 10)}.csv`,
                      ["الخطورة", "الدرجة", "الاسم", "الرقم", "كل الطلبات", "واصلة", "ملغاة", "نسبة الإلغاء", "الأسباب"],
                      accounts.map((a) => [RISK_LABEL[a.risk], a.score, a.name, a.phone, a.totalOrders, a.delivered, a.cancelled, `${a.cancelRate}%`, a.reasons.join(" | ")]),
                    )
                  }
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  ⬇️ Excel
                </button>
              </div>
            </div>
            {accounts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ما في حسابات مشبوهة بهالفترة 👌</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-right font-medium">الخطورة</th>
                      <th className="px-4 py-3 text-right font-medium">الحساب</th>
                      <th className="px-4 py-3 text-right font-medium">الطلبات</th>
                      <th className="px-4 py-3 text-right font-medium">ليش مشبوه</th>
                      <th className="px-4 py-3 text-right font-medium">آخر طلب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr
                        key={a.userId}
                        onClick={() => setUserFilter(userFilter?.userId === a.userId ? null : a)}
                        className={`cursor-pointer border-b align-top transition-colors last:border-0 hover:bg-muted/20 ${userFilter?.userId === a.userId ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_STYLE[a.risk]}`}>
                            {RISK_LABEL[a.risk]} · {a.score}
                          </span>
                          {a.blocked && <span className="mr-1 text-[11px] text-red-600">محظور</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{a.name}</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(a.phone, "انسخ الرقم");
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                            dir="ltr"
                          >
                            {a.phone} 📋
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          <span className="font-semibold">{a.totalOrders}</span> طلب ·{" "}
                          <span className="text-green-600">{a.delivered} واصل</span> ·{" "}
                          <span className="text-red-600">{a.cancelled} ملغى</span>
                          <p className="text-muted-foreground">إلغاء {a.cancelRate}٪</p>
                        </td>
                        <td className="px-4 py-3">
                          <ul className="space-y-0.5 text-xs">
                            {a.reasons.map((r) => (
                              <li key={r}>• {r}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{fmt(a.lastOrderAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Orders */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="font-semibold">
                  📦 الطلبات المعزولة
                  {activeFlag !== "all" && ` — ${FLAG_META[activeFlag].icon} ${FLAG_META[activeFlag].label}`}
                  {userFilter && ` — ${userFilter.name}`}
                  <span className="mr-2 text-sm font-normal text-muted-foreground">({orders.length.toLocaleString("ar-SY")})</span>
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ما انحذف شي — هي بس قائمة عزل لتقرر. الطلب الواحد ممكن يكون بأكتر من قسم.
                </p>
              </div>
              <div className="flex gap-2">
                {userFilter && (
                  <button onClick={() => setUserFilter(null)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
                    ✕ إلغاء فلترة الحساب
                  </button>
                )}
                <button
                  onClick={() =>
                    downloadCsv(
                      `isolated-orders-${new Date().toISOString().slice(0, 10)}.csv`,
                      ["رقم الطلب", "التاريخ", "الحالة", "النوع", "الطلب", "الزبون", "الرقم", "مين ألغى", "وقت الإلغاء", "الأقسام"],
                      orders.map((o) => [o.id, fmt(o.createdAt), o.status, o.orderType === "errand" ? "حر" : "مطعم", o.summary, o.userName, o.userPhone, o.cancelBy ? CANCEL_BY[o.cancelBy] : "", fmt(o.cancelledAt), o.flags.map((f) => FLAG_META[f].label).join(" | ")]),
                    )
                  }
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  ⬇️ Excel
                </button>
              </div>
            </div>
            {orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ما في طلبات بهالقسم</p>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                      <th className="px-4 py-3 text-right font-medium">الزبون</th>
                      <th className="px-4 py-3 text-right font-medium">الطلب</th>
                      <th className="px-4 py-3 text-right font-medium">الحالة</th>
                      <th className="px-4 py-3 text-right font-medium">ليش انعزل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b align-top last:border-0 hover:bg-muted/20">
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          {fmt(o.createdAt)}
                          <p className="font-mono text-[10px] text-muted-foreground">{o.id.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-medium">{o.userName}</p>
                          <p className="text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{o.userPhone}</p>
                        </td>
                        <td className="max-w-[240px] px-4 py-3 text-xs">
                          <span className="ml-1">{o.orderType === "errand" ? "🛵 حر" : "🍽️"}</span>
                          {o.summary}
                          {o.totalPrice != null && <p className="text-muted-foreground">{o.totalPrice.toLocaleString("ar-SY")} ل.س</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          {o.status === "cancelled" ? (
                            <>
                              <span className="font-medium text-red-600">ملغى</span>
                              <p className="text-muted-foreground">{o.cancelBy ? CANCEL_BY[o.cancelBy] : ""}</p>
                              <p className="text-muted-foreground">{fmt(o.cancelledAt)}</p>
                            </>
                          ) : o.status === "delivered" ? (
                            <span className="font-medium text-green-600">واصل</span>
                          ) : (
                            <span className="text-muted-foreground">{o.status}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {o.flags.map((f) => (
                              <span key={f} title={FLAG_META[f].hint} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                {FLAG_META[f].icon} {FLAG_META[f].label}
                              </span>
                            ))}
                          </div>
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
