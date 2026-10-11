import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CrashAlert } from "@/lib/api";
import { playAlarm, notifyBrowser, timeAgo } from "@/lib/whatsappStatus";

const REASON_LABEL: Record<CrashAlert["reason"], string> = {
  new: "جديد",
  regression: "رجع بعد الإصلاح",
  ongoing: "مستمر",
};

/**
 * Global banner (every admin page): app crashes from the last 24h that nobody
 * has muted or marked fixed. Beeps once per crash that appears while the admin
 * is watching, so a bad release is caught before customers start calling.
 */
export default function CrashAlertBanner() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "crashes", "alerts"],
    queryFn: api.getCrashAlerts,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const seen = useRef<Set<string> | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const mute = useMutation({
    mutationFn: (fp: string) => api.updateCrashGroup(fp, { muted: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "crashes"] }),
  });

  useEffect(() => {
    if (!data) return;
    // First load only records what's already there; alert on what appears after.
    if (seen.current === null) {
      seen.current = new Set(data.alerts.map((a) => a.fingerprint));
      return;
    }
    const fresh = data.alerts.filter((a) => !seen.current!.has(a.fingerprint));
    if (fresh.length > 0) {
      playAlarm();
      notifyBrowser("💥 زبوني — عطل بالتطبيق", fresh[0]!.message.slice(0, 120));
      setCollapsed(false);
    }
    for (const a of data.alerts) seen.current.add(a.fingerprint);
  }, [data]);

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;
  const people = alerts.reduce((n, a) => n + a.users, 0);

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border-2 border-rose-400 bg-rose-50 text-rose-900 shadow-sm dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
    >
      <button onClick={() => setCollapsed((c) => !c)} className="flex w-full items-center gap-3 px-4 py-3 text-right">
        <span className="text-lg">💥</span>
        <span className="flex-1 text-sm font-bold">
          {alerts.length.toLocaleString("ar-SY")} عطل بالتطبيق آخر ٢٤ ساعة · صاب تقريباً {people.toLocaleString("ar-SY")} شخص
        </span>
        <Link href="/crashes" className="text-xs font-bold underline" onClick={(e) => e.stopPropagation()}>
          التفاصيل
        </Link>
        <span className="text-xs opacity-60">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <ul className="divide-y divide-rose-200 border-t border-rose-200 dark:divide-rose-900 dark:border-rose-900">
          {alerts.map((a) => (
            <li key={a.fingerprint} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
              <span className="rounded bg-rose-200 px-1.5 py-0.5 text-[11px] font-bold dark:bg-rose-900">
                {REASON_LABEL[a.reason]}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr" title={a.message}>
                {a.message}
              </span>
              <span className="text-xs">
                {a.count.toLocaleString("ar-SY")} مرة · {a.users.toLocaleString("ar-SY")} شخص · {timeAgo(a.lastSeen)}
              </span>
              <Link href={`/crashes?fp=${a.fingerprint}`} className="text-xs font-bold underline">
                فتح
              </Link>
              <button
                className="text-xs opacity-70 underline"
                disabled={mute.isPending}
                onClick={() => mute.mutate(a.fingerprint)}
              >
                تجاهل
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
