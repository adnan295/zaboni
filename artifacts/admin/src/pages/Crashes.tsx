import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CrashGroup, type CrashKind } from "@/lib/api";
import { timeAgo } from "@/lib/whatsappStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const KIND_LABEL: Record<CrashKind, string> = {
  fatal: "سكّر التطبيق",
  render: "شاشة خطأ",
  error: "خطأ بالخلفية",
};

const ROLE_LABEL: Record<string, string> = { customer: "زبون", courier: "مندوب", guest: "زائر" };

const fmt = (n: number) => n.toLocaleString("ar-SY");

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function AlertSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "crashes", "settings"], queryFn: api.getCrashSettings });
  const [phone, setPhone] = useState("");
  useEffect(() => { if (data) setPhone(data.alertPhone); }, [data]);
  const save = useMutation({
    mutationFn: () => api.updateCrashSettings(phone),
    onSuccess: (r) => {
      qc.setQueryData(["admin", "crashes", "settings"], r);
      toast({ title: r.alertPhone ? "تمام، رح توصلك تنبيهات الأعطال عالواتساب" : "انطفت تنبيهات الواتساب" });
    },
    onError: (e) => toast({ title: "ما انحفظ", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">📲 تنبيه واتساب للأعطال</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          بيوصلك مسج من رقم الواتساب المربوط أول ما يظهر عطل جديد، أو لما عطل يصيب ٣ أشخاص خلال نص ساعة، أو لما يرجع عطل
          علّمته «انحل». بلا تكرار: مرة كل ٦ ساعات لنفس العطل كحد أقصى.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            dir="ltr"
            className="max-w-xs"
            placeholder="+963912345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            حفظ
          </Button>
        </div>
        {!data?.alertPhone && <p className="text-xs text-amber-700 dark:text-amber-400">ما في رقم — التنبيه حالياً بس على لوحة الإدارة.</p>}
      </CardContent>
    </Card>
  );
}

function GroupDetails({ group }: { group: CrashGroup }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "crashes", "events", group.fingerprint],
    queryFn: () => api.getCrashEvents(group.fingerprint),
  });
  return (
    <div className="space-y-3 border-t bg-muted/30 p-4">
      <pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-[11px] leading-5">
        {group.stack || group.message}
      </pre>
      <div className="text-xs font-bold">آخر المرات ({isLoading ? "…" : fmt(data?.events.length ?? 0)})</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-right">
              <th className="p-1 font-medium">متى</th>
              <th className="p-1 font-medium">مين</th>
              <th className="p-1 font-medium">الشاشة</th>
              <th className="p-1 font-medium">الجهاز</th>
              <th className="p-1 font-medium">النسخة</th>
            </tr>
          </thead>
          <tbody>
            {data?.events.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-1 whitespace-nowrap">{timeAgo(e.occurredAt)}</td>
                <td className="p-1">
                  {e.userName ?? "غير مسجّل"} {e.role && <span className="opacity-60">({ROLE_LABEL[e.role] ?? e.role})</span>}
                  {e.userPhone && (
                    <a href={`tel:${e.userPhone}`} dir="ltr" className="mx-1 underline">
                      {e.userPhone}
                    </a>
                  )}
                </td>
                <td className="p-1 font-mono" dir="ltr">{e.route || "—"}</td>
                <td className="p-1" dir="ltr">
                  {e.device || "—"} · {e.platform} {e.osVersion}
                </td>
                <td className="p-1" dir="ltr">
                  {e.appVersion || "—"}
                  {e.updateId && e.updateId !== "embedded" && <span className="opacity-60"> · OTA {e.updateId.slice(0, 8)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Crashes() {
  const qc = useQueryClient();
  const [days, setDays] = useState(7);
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(window.location.search).get("fp"));
  const [showHidden, setShowHidden] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "crashes", "overview", days],
    queryFn: () => api.getCrashes(days),
    refetchInterval: 60_000,
  });
  const update = useMutation({
    mutationFn: ({ fp, body }: { fp: string; body: { muted?: boolean; resolved?: boolean } }) => api.updateCrashGroup(fp, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "crashes"] }),
  });

  const groups = (data?.groups ?? []).filter((g) => showHidden || ((!g.muted && !g.resolvedAt) || g.regressed));
  const hiddenCount = (data?.groups.length ?? 0) - (data?.groups ?? []).filter((g) => (!g.muted && !g.resolvedAt) || g.regressed).length;
  const maxDay = Math.max(1, ...(data?.byDay ?? []).map((d) => d.crashes));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold">💥 أعطال التطبيق</h1>
        {[1, 7, 30].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d === 1 ? "اليوم" : `${fmt(d)} يوم`}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        كل مرة التطبيق بيسكّر لحالو أو بتطلع شاشة خطأ عند حدا، بتوصل لهون مع الشاشة والجهاز والنسخة. الأعطال المتشابهة
        بتنجمع بسطر واحد. (أعطال النظام الأصلية — مثل نفاد الذاكرة — بتبين بس بـ Play Console و App Store Connect.)
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="مرات العطل" value={isLoading ? "…" : fmt(data?.totals.crashes ?? 0)} />
        <StatCard label="أشخاص تأثروا" value={isLoading ? "…" : fmt(data?.totals.users ?? 0)} />
        <StatCard label="أنواع الأعطال" value={isLoading ? "…" : fmt(data?.totals.groups ?? 0)} />
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">باليوم</div>
            <div className="mt-2 flex h-10 items-end gap-0.5" dir="ltr">
              {(data?.byDay ?? []).map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.crashes} مرة · ${d.users} شخص`}
                  className="flex-1 rounded-t bg-rose-400"
                  style={{ height: `${Math.max(8, (d.crashes / maxDay) * 100)}%` }}
                />
              ))}
              {!data?.byDay.length && <span className="text-xs text-muted-foreground">ما في أعطال 🎉</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertSettings />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">الأعطال حسب عدد المتأثرين</CardTitle>
          {hiddenCount > 0 && (
            <button className="text-xs underline" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? "خبّي المحلولة والمتجاهلة" : `اعرض المحلولة والمتجاهلة (${fmt(hiddenCount)})`}
            </button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && groups.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">ما في أعطال بهالفترة 🎉</div>
          )}
          <ul className="divide-y">
            {groups.map((g) => (
              <li key={g.fingerprint}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <button className="min-w-0 flex-1 text-right" onClick={() => setOpen(open === g.fingerprint ? null : g.fingerprint)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={g.kind === "fatal" ? "destructive" : "secondary"}>{KIND_LABEL[g.kind]}</Badge>
                      {g.regressed && <Badge variant="destructive">رجع بعد الإصلاح</Badge>}
                      {g.resolvedAt && !g.regressed && <Badge variant="outline">انحل ✓</Badge>}
                      {g.muted && <Badge variant="outline">متجاهل</Badge>}
                      {Date.now() - new Date(g.firstSeen).getTime() < 86_400_000 && <Badge>جديد</Badge>}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs" dir="ltr" title={g.message}>
                      {g.message}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {g.platforms.join(" / ")} · نسخ: <span dir="ltr">{g.versions.join(", ") || "—"}</span>
                      {g.routes.length > 0 && (
                        <>
                          {" "}· شاشات: <span dir="ltr" className="font-mono">{g.routes.join(", ")}</span>
                        </>
                      )}
                      {" "}· أول مرة {timeAgo(g.firstSeen)} · آخر مرة {timeAgo(g.lastSeen)}
                    </div>
                  </button>
                  <div className="text-center">
                    <div className="text-lg font-bold tabular-nums">{fmt(g.users)}</div>
                    <div className="text-[10px] text-muted-foreground">شخص</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold tabular-nums">{fmt(g.count)}</div>
                    <div className="text-[10px] text-muted-foreground">مرة</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ fp: g.fingerprint, body: { resolved: !g.resolvedAt || g.regressed } })}
                    >
                      {g.resolvedAt && !g.regressed ? "رجّعه مفتوح" : "انحل ✓"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ fp: g.fingerprint, body: { muted: !g.muted } })}
                    >
                      {g.muted ? "فعّل التنبيه" : "تجاهل"}
                    </Button>
                  </div>
                </div>
                {open === g.fingerprint && <GroupDetails group={g} />}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
