import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, type CourierPerformanceRow, type CourierPerformanceDetail, type AdminNote } from "@/lib/api";

const DAY_OPTIONS = [
  { value: 7, label: "٧ أيام" },
  { value: 30, label: "٣٠ يوماً" },
] as const;

type SortKey =
  | "name"
  | "phone"
  | "deliveries"
  | "cancelledAfterAssign"
  | "acceptanceRate"
  | "avgDeliveryMinutes"
  | "avgRating"
  | "lastSeen";

const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  delivered:  { label: "موصَّل",     color: "text-green-600" },
  cancelled:  { label: "ملغى",       color: "text-red-500"   },
  accepted:   { label: "مقبول",      color: "text-blue-500"  },
  picked_up:  { label: "مُستلَم",    color: "text-purple-500"},
  on_way:     { label: "في الطريق",  color: "text-orange-500"},
  searching:  { label: "بحث",        color: "text-gray-400"  },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "الآن";
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} س`;
  const d = Math.floor(h / 24);
  return `${d} يوم`;
}

function rowHighlightClass(row: CourierPerformanceRow): string {
  if (row.avgRating !== null && row.avgRating < 3)
    return "bg-red-50 dark:bg-red-950/20 border-r-2 border-r-red-500";
  if (row.acceptanceRate !== null && row.acceptanceRate < 50)
    return "bg-amber-50 dark:bg-amber-950/20 border-r-2 border-r-amber-400";
  return "";
}

function StarRow({ stars }: { stars: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= stars ? "text-amber-400" : "text-muted-foreground/30"}>
          ★
        </span>
      ))}
    </span>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────────────────

function NotesSection({ courierId }: { courierId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery<AdminNote[]>({
    queryKey: ["admin", "courier-notes", courierId],
    queryFn: () => api.getCourierNotes(courierId),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (t: string) => api.addCourierNote(courierId, t),
    onSuccess: () => {
      setText("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["admin", "courier-notes", courierId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed);
  }

  function formatNoteDate(iso: string) {
    return new Date(iso).toLocaleString("ar-SY", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <h3 className="font-medium mb-3">ملاحظات إدارية</h3>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="mb-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب ملاحظة داخلية (تحذير، تقدير، إجراء…)"
          rows={2}
          maxLength={1000}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          dir="rtl"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{text.length}/1000</span>
          <button
            type="submit"
            disabled={!text.trim() || mutation.isPending}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? "جارٍ الحفظ…" : "إضافة ملاحظة"}
          </button>
        </div>
      </form>

      {/* Notes list */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">جارٍ التحميل…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد ملاحظات بعد</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              dir="rtl"
            >
              <p className="whitespace-pre-wrap break-words">{note.text}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatNoteDate(note.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailModal({
  courier,
  days,
  onClose,
}: {
  courier: CourierPerformanceRow;
  days: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<CourierPerformanceDetail>({
    queryKey: ["admin", "courier-performance-detail", courier.id, days],
    queryFn: () => api.getCourierPerformanceDetail(courier.id, days),
    staleTime: 60_000,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {courier.avatarUrl ? (
              <img
                src={courier.avatarUrl.startsWith("/") ? `/api${courier.avatarUrl}` : courier.avatarUrl}
                alt={courier.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center text-sm font-bold">
                {courier.name ? courier.name.charAt(0) : "?"}
              </div>
            )}
            <div>
              <p className="font-semibold">{courier.name || "بدون اسم"}</p>
              <p className="text-xs text-muted-foreground font-mono">{courier.phone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Summary KPI strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground mb-1">توصيلات</p>
              <p className="text-lg font-bold text-green-600">{courier.deliveries}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground mb-1">معدل القبول</p>
              <p className={`text-lg font-bold ${
                courier.acceptanceRate === null
                  ? "text-muted-foreground"
                  : courier.acceptanceRate < 50
                  ? "text-amber-600"
                  : "text-blue-600"
              }`}>
                {courier.acceptanceRate !== null ? `${courier.acceptanceRate}٪` : "—"}
              </p>
              {courier.totalAssigned > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {courier.deliveries}/{courier.totalAssigned} مكتمل/مُسنَد
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-card px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground mb-1">متوسط التقييم</p>
              <p className={`text-lg font-bold ${
                courier.avgRating === null
                  ? "text-muted-foreground"
                  : courier.avgRating < 3
                  ? "text-red-500"
                  : "text-foreground"
              }`}>
                {courier.avgRating !== null ? `★ ${courier.avgRating.toFixed(1)}` : "—"}
              </p>
              {courier.ratingCount > 0 && (
                <p className="text-[10px] text-muted-foreground">{courier.ratingCount} تقييم</p>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جارٍ التحميل…</div>
          ) : !data ? (
            <div className="text-center py-8 text-destructive text-sm">فشل تحميل البيانات</div>
          ) : (
            <>
              {/* Daily deliveries chart */}
              <div>
                <h3 className="font-medium mb-3">التوصيلات اليومية</h3>
                {data.dailyDeliveries.every((d) => d.count === 0) ? (
                  <p className="text-sm text-muted-foreground">لا توجد توصيلات في هذه الفترة</p>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={data.dailyDeliveries}
                      margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickFormatter={(v: string) => v.slice(5)}
                        interval={Math.max(0, Math.floor(data.dailyDeliveries.length / 6) - 1)}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        allowDecimals={false}
                        width={24}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--popover-foreground)",
                          fontSize: 12,
                        }}
                        labelFormatter={(l: string) => `تاريخ: ${l}`}
                        formatter={(v: number) => [v, "توصيلات"]}
                      />
                      <Bar dataKey="count" name="توصيلات" fill="#f97316" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Rating history */}
              <div>
                <h3 className="font-medium mb-3">
                  سجل التقييمات
                  {data.ratingHistory.length > 0 && (
                    <span className="mr-2 text-xs font-normal text-muted-foreground">
                      ({data.ratingHistory.length} تقييم)
                    </span>
                  )}
                </h3>
                {data.ratingHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد تقييمات في هذه الفترة</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="text-right px-3 py-2 font-medium">التقييم</th>
                          <th className="text-right px-3 py-2 font-medium">العميل</th>
                          <th className="text-right px-3 py-2 font-medium">المطعم</th>
                          <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.ratingHistory.map((r, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <StarRow stars={r.stars} />
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {r.customerName || "—"}
                            </td>
                            <td className="px-3 py-2 max-w-[110px] truncate">
                              {r.restaurantName || "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {new Date(r.ratedAt).toLocaleDateString("ar-SY")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent orders */}
              <div>
                <h3 className="font-medium mb-3">آخر الطلبات</h3>
                {data.recentOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد طلبات في هذه الفترة</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="text-right px-3 py-2 font-medium">المطعم</th>
                          <th className="text-right px-3 py-2 font-medium">العميل</th>
                          <th className="text-right px-3 py-2 font-medium">رسوم</th>
                          <th className="text-right px-3 py-2 font-medium">الحالة</th>
                          <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.recentOrders.map((o) => {
                          const st = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, color: "" };
                          return (
                            <tr key={o.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium max-w-[120px] truncate">
                                {o.restaurantName || "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {o.customerName || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {o.deliveryFee ? `${o.deliveryFee.toLocaleString("ar-SY")} ل.س` : "—"}
                              </td>
                              <td className={`px-3 py-2 font-medium ${st.color}`}>{st.label}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {new Date(o.createdAt).toLocaleDateString("ar-SY")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Admin notes */}
              <div className="border-t pt-4">
                <NotesSection courierId={courier.id} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CourierPerformance() {
  const [days, setDays] = useState<7 | 30>(7);
  const [sortKey, setSortKey] = useState<SortKey>("deliveries");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<CourierPerformanceRow | null>(null);

  const { data = [], isLoading, isError } = useQuery<CourierPerformanceRow[]>({
    queryKey: ["admin", "courier-performance", days],
    queryFn: () => api.getCourierPerformance(days),
    staleTime: 60_000,
  });

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey] as string | number | null | undefined;
      const bv = b[sortKey] as string | number | null | undefined;

      // Nulls always last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv, "ar") : bv.localeCompare(av, "ar");
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortTh({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) {
    const active = sortKey === col;
    return (
      <th
        className={`text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap ${className}`}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-[10px]">{active ? (sortAsc ? "▲" : "▼") : "⇅"}</span>
        </span>
      </th>
    );
  }

  const flags = {
    lowRating: data.filter((r) => r.avgRating !== null && r.avgRating < 3).length,
    lowAcceptance: data.filter((r) => r.acceptanceRate !== null && r.acceptanceRate < 50).length,
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">أداء السائقين</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إحصائيات الأداء ومعدلات القبول والتقييمات
          </p>
        </div>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value as 7 | 30)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                days === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alert banners */}
      {(flags.lowRating > 0 || flags.lowAcceptance > 0) && (
        <div className="flex flex-wrap gap-3">
          {flags.lowRating > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
              <span>🔴</span>
              <span><strong>{flags.lowRating}</strong> سائق بتقييم أقل من ٣</span>
            </div>
          )}
          {flags.lowAcceptance > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
              <span>⚠️</span>
              <span><strong>{flags.lowAcceptance}</strong> سائق بمعدل قبول أقل من ٥٠٪</span>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground text-sm">جارٍ التحميل…</div>
      )}
      {isError && (
        <div className="text-center py-16 text-destructive text-sm">فشل تحميل البيانات</div>
      )}

      {!isLoading && !isError && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <SortTh col="name"                 label="السائق"                       />
                  <SortTh col="phone"                label="الهاتف"                       />
                  <SortTh col="deliveries"           label={`التوصيلات (${days}د)`}       />
                  <SortTh col="cancelledAfterAssign" label="ملغى بعد الإسناد"             />
                  <SortTh col="acceptanceRate"       label="معدل القبول"                  />
                  <SortTh col="avgDeliveryMinutes"   label="متوسط وقت التوصيل"           />
                  <SortTh col="avgRating"            label="متوسط التقييم"                />
                  <SortTh col="lastSeen"             label="آخر نشاط"                     />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      لا يوجد سائقون
                    </td>
                  </tr>
                ) : (
                  sorted.map((row) => (
                    <tr
                      key={row.id}
                      className={`transition-colors hover:brightness-95 ${rowHighlightClass(row)}`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {row.avatarUrl ? (
                            <img
                              src={row.avatarUrl.startsWith("/") ? `/api${row.avatarUrl}` : row.avatarUrl}
                              alt={row.name}
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {row.name ? row.name.charAt(0) : "?"}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">
                              {row.name || <span className="text-muted-foreground italic">بدون اسم</span>}
                            </span>
                            {row.isOnline && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" title="متصل" />
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.phone}
                      </td>
                      {/* Deliveries */}
                      <td className="px-4 py-3 font-bold text-green-600">
                        {row.deliveries.toLocaleString("ar-SY")}
                      </td>
                      {/* Cancelled after assign */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.cancelledAfterAssign > 0 ? (
                          <span className="text-red-500 font-medium">{row.cancelledAfterAssign}</span>
                        ) : (
                          <span>٠</span>
                        )}
                      </td>
                      {/* Acceptance rate */}
                      <td className="px-4 py-3">
                        {row.acceptanceRate === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              row.acceptanceRate < 50
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : row.acceptanceRate >= 80
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                            title={`${row.deliveries} مكتمل من أصل ${row.totalAssigned} مُسنَد`}
                          >
                            {row.acceptanceRate}٪
                          </span>
                        )}
                      </td>
                      {/* Avg delivery time */}
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.avgDeliveryMinutes === null ? "—" : `${row.avgDeliveryMinutes} دقيقة`}
                      </td>
                      {/* Avg rating */}
                      <td className="px-4 py-3">
                        {row.avgRating === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              row.avgRating < 3
                                ? "text-red-500"
                                : row.avgRating >= 4
                                ? "text-green-600"
                                : "text-foreground"
                            }`}
                            title={`${row.ratingCount} تقييم`}
                          >
                            ★ {row.avgRating.toFixed(1)}
                            {row.ratingCount > 0 && (
                              <span className="text-xs font-normal text-muted-foreground mr-1">
                                ({row.ratingCount})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      {/* Last seen */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {timeAgo(row.lastSeen)}
                      </td>
                      {/* Action */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(row)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
                        >
                          عرض مفصل
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border-r-2 border-red-500" />
              تقييم &lt; ٣
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border-r-2 border-amber-400" />
              معدل قبول &lt; ٥٠٪
            </span>
            <span className="mr-auto text-muted-foreground/70">
              * معدل القبول = التوصيلات ÷ (التوصيلات + الملغى بعد الإسناد)
            </span>
          </div>
        </div>
      )}

      {selected && (
        <DetailModal
          courier={selected}
          days={days}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
