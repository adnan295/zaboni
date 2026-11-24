import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/whatsappStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const STATUS: Record<string, { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  ended: { label: "تم الوصل", tone: "default" },
  merged: { label: "عم يحكوا", tone: "default" },
  dialing: { label: "عم يرن", tone: "secondary" },
  failed: { label: "ما تم", tone: "destructive" },
  rejected: { label: "مرفوض", tone: "outline" },
};

const REASON: Record<string, string> = {
  unknown_caller: "رقم مو مسجّل عنا (أو مخفي)",
  no_active_order: "ما عنده طلب شغّال",
  no_target_phone: "الطرف التاني بلا رقم",
  no_answer: "ما ردّ",
  busy: "مشغول",
  rejected: "رفض المكالمة",
  caller_hung_up: "المتصل سكّر قبل الوصل",
  merge_failed: "الشبكة ما قبلت الدمج",
  dial_error: "خطأ بالاتصال",
  no_call_permission: "التلفون بلا صلاحية اتصال",
  no_server: "التلفون ما وصل للسيرفر",
};

const ROLE: Record<string, string> = { courier: "مندوب", customer: "زبون" };

/**
 * هاتف الإدارة: the office phones that put couriers and customers through to each
 * other on the company SIM, so neither ever sees the other's number.
 */
export default function CallLine() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "call-bridge"], queryFn: api.getCallBridge, refetchInterval: 10_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "call-bridge"] });
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [newToken, setNewToken] = useState<{ phone: string; token: string } | null>(null);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.setCallBridgeEnabled(enabled),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: () => api.createCallLine({ label, phone }),
    onSuccess: (r) => {
      setNewToken({ phone, token: r.token });
      setLabel("");
      setPhone("");
      refresh();
    },
    onError: (e) => toast({ title: "ما انضاف", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
  });
  const lineEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.setCallLineEnabled(id, enabled),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteCallLine(id), onSuccess: refresh });

  if (isLoading || !data) return <div className="p-6 text-muted-foreground">عم يحمّل…</div>;
  const online = data.lines.filter((l) => l.online).length;
  const today = data.calls.filter((c) => new Date(c.createdAt).toDateString() === new Date().toDateString());
  const connected = today.filter((c) => c.status === "ended" || c.status === "merged").length;

  return (
    <div className="space-y-4 p-4 md:p-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">📞 هاتف الإدارة</h1>
        <p className="text-sm text-muted-foreground">
          المندوب والزبون بيتصلوا على رقم الشركة، والتلفون يلي بالمكتب بيوصّلهن ببعض. ما حدا بيشوف رقم التاني.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="space-y-1">
            <div className="font-bold">
              {data.masking ? "🟢 الأرقام مخفية هلق" : data.enabled ? "🟠 مفعّل، بس ما في تلفون متصل — الأرقام الحقيقية ظاهرة" : "⚪️ موقّف — الأرقام الحقيقية ظاهرة"}
            </div>
            <div className="text-xs text-muted-foreground">
              إذا انقطعت الكهربا أو النت عن كل التلفونات، الأرقام الحقيقية بترجع تلقائياً لحتى ما حدا يعلق.
            </div>
          </div>
          <Button variant={data.enabled ? "outline" : "default"} onClick={() => toggle.mutate(!data.enabled)} disabled={toggle.isPending}>
            {data.enabled ? "وقّف الإخفاء" : "شغّل الإخفاء"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">تلفونات متصلة</div><div className="text-2xl font-bold">{online} / {data.lines.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">مكالمات اليوم</div><div className="text-2xl font-bold">{today.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">انوصلت</div><div className="text-2xl font-bold">{connected}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">التلفونات</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.lines.length === 0 && <p className="text-muted-foreground">ما في تلفونات لسا. ضيف أول تلفون تحت.</p>}
          {data.lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <div className="font-bold">{l.label || "تلفون"} · <span dir="ltr">{l.phone}</span></div>
                <div className="text-xs text-muted-foreground">
                  {!l.enabled ? "موقوف" : l.online ? "🟢 متصل" : l.lastSeenAt ? `🔴 آخر ظهور ${timeAgo(l.lastSeenAt)}` : "🔴 لسا ما اشتغل"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => lineEnabled.mutate({ id: l.id, enabled: !l.enabled })}>
                  {l.enabled ? "إيقاف" : "تشغيل"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف هالتلفون؟ رمزه رح يبطل يشتغل.")) remove.mutate(l.id); }}>
                  حذف
                </Button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Input className="max-w-[160px]" placeholder="اسم (تلفون ١)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input dir="ltr" className="max-w-[200px]" placeholder="رقم الشريحة 09…" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button onClick={() => create.mutate()} disabled={!phone || create.isPending}>ضيف تلفون</Button>
          </div>
          {newToken && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
              <div className="font-bold">رمز التلفون <span dir="ltr">{newToken.phone}</span> — بيظهر مرة وحدة بس:</div>
              <div dir="ltr" className="my-2 select-all rounded bg-background p-2 font-mono text-lg">{newToken.token}</div>
              <div className="text-xs text-muted-foreground">اكتبه بتطبيق «خط زبوني» على التلفون. إذا ضاع، احذف التلفون وضيفه من جديد.</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">سجل المكالمات</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {data.calls.length === 0 ? (
            <p className="text-muted-foreground">لسا ما في مكالمات.</p>
          ) : (
            <div className="divide-y">
              {data.calls.map((c) => {
                const st = STATUS[c.status] ?? { label: c.status, tone: "outline" as const };
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div>
                        <b>{c.callerName ?? "رقم غريب"}</b>
                        {c.callerRole ? <span className="text-muted-foreground"> ({ROLE[c.callerRole] ?? c.callerRole})</span> : null}
                        {c.targetName ? <> ← <b>{c.targetName}</b></> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {timeAgo(c.createdAt)}
                        {c.orderId ? ` · طلب #${c.orderId.slice(-6)}` : ""}
                        {c.reason ? ` · ${REASON[c.reason] ?? c.reason}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.talkSeconds != null && <span className="tabular-nums text-muted-foreground">{Math.floor(c.talkSeconds / 60)}:{String(c.talkSeconds % 60).padStart(2, "0")}</span>}
                      <Badge variant={st.tone}>{st.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
