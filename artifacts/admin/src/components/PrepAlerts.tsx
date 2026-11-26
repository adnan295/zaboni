import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SlaAlert } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

/**
 * «عم يتحضّر» with no courier (api-server lib/orderPrep): the customer was told
 * the order is being prepared after a minute without a courier. The admin
 * orders it from the restaurant («طلبناه من المطعم» stops couriers calling the
 * restaurant too) and hands it to a courier.
 */
export default function PrepAlerts() {
  const { data = [] } = useQuery({
    queryKey: ["admin", "sla-alerts", 1],
    queryFn: () => api.getSlaAlerts(1),
    refetchInterval: 10_000,
  });
  const preparing = data.filter((a) => a.prepStartedAt);
  return (
    <>
      <AutoPrepSwitch />
      {preparing.length > 0 && <PreparingCard preparing={preparing} />}
    </>
  );
}

/**
 * On/off and the admin's hours: outside them orders wait for a courier as
 * before («استلمنا طلبك», still cancellable), because nobody is there to order
 * from the restaurant.
 */
function AutoPrepSwitch() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin", "auto-prep"], queryFn: api.getAutoPrep, refetchInterval: 60_000 });
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: api.saveAutoPrep,
    onSuccess: (v) => {
      qc.setQueryData(["admin", "auto-prep"], v);
      setFrom(null); setTo(null);
      toast({ title: v.enabled ? (v.activeNow ? "التأكيد التلقائي شغّال هلق" : "انحفظ، بيشتغل بساعات الدوام") : "التأكيد التلقائي مطفي" });
    },
    onError: () => toast({ title: "ما انحفظ، جرّب مرة تانية", variant: "destructive" }),
  });
  if (!data) return null;
  const f = from ?? data.from, t = to ?? data.to;
  const allDay = f === t;
  const dirty = f !== data.from || t !== data.to;
  return (
    <Card className="shadow-sm">
      <CardContent className="py-3 flex flex-wrap items-center gap-3 text-sm">
        <Switch checked={data.enabled} onCheckedChange={(enabled) => save.mutate({ enabled, from: data.from, to: data.to })} disabled={save.isPending} />
        <div className="font-semibold">«عم يتحضّر» تلقائياً بعد دقيقة بلا مندوب</div>
        <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${data.activeNow ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>
          {data.activeNow ? "شغّال هلق" : data.enabled ? "برا ساعات الدوام" : "مطفي"}
        </span>
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-muted-foreground">ساعات الإدارة (توقيت حمص): من</span>
          <input type="time" value={f} onChange={(e) => setFrom(e.target.value)} className="border rounded-md px-2 py-1 bg-background" />
          <span className="text-muted-foreground">لـ</span>
          <input type="time" value={t} onChange={(e) => setTo(e.target.value)} className="border rounded-md px-2 py-1 bg-background" />
          {allDay && <span className="text-xs text-muted-foreground">(نفس الوقت = طول اليوم)</span>}
          {dirty && (
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ enabled: data.enabled, from: f, to: t })}>حفظ</Button>
          )}
        </div>
        <div className="basis-full text-xs text-muted-foreground">
          برا هالساعات أو لما يكون مطفي، الزبون بيشوف «جاري إرسال طلبك للمطعم» وفيه يلغي. وإذا ما قبلو مندوب (أو ما تابعتوه انتو) خلال 5 دقايق، بينلغى تلقائياً وبيوصل للزبون إشعار.
        </div>
      </CardContent>
    </Card>
  );
}

function PreparingCard({ preparing }: { preparing: SlaAlert[] }) {
  return (
    <Card className="shadow-sm border-red-300 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          طلبات عم تتحضّر ولسا ما في مندوب ({preparing.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {preparing.map((a) => <PrepRow key={a.id} alert={a} />)}
      </CardContent>
    </Card>
  );
}

const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));

function PrepRow({ alert }: { alert: SlaAlert }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "sla-alerts"] });

  const ordered = useMutation({
    mutationFn: () => api.markOrderedFromRestaurant(alert.id),
    onSuccess: () => { toast({ title: "تمام، المناديب رح يعرفوا إنو الطلب مطلوب من المطعم" }); refresh(); },
    onError: (e: Error) => {
      toast({
        title: e.message === "courier_took_it" ? "قبلو مندوب قبلكن، هو بيتواصل مع المطعم" : "ما انحفظ، جرّب مرة تانية",
        variant: "destructive",
      });
      refresh();
    },
  });

  const options = useQuery({
    queryKey: ["admin", "courier-options", alert.id],
    queryFn: () => api.getCourierOptions(alert.id),
    enabled: assignOpen,
    refetchInterval: assignOpen ? 15_000 : false,
  });

  const assign = useMutation({
    mutationFn: (courierId: string) => api.assignOrder(alert.id, courierId),
    onSuccess: () => { toast({ title: "انحوّل الطلب للمندوب" }); setAssignOpen(false); refresh(); },
    onError: () => { toast({ title: "ما انحوّل: يمكن صار مع مندوب أو المندوب معو طلب", variant: "destructive" }); refresh(); },
  });

  const age = alert.prepStartedAt ? minutesSince(alert.prepStartedAt) : alert.ageMinutes;
  const late = age >= 10;
  const list = options.data?.options ?? [];
  const chosen = picked ?? list.find((o) => o.canTake)?.id ?? null;
  const chosenName = list.find((o) => o.id === chosen)?.name;

  return (
    <div className={`rounded-xl border bg-white dark:bg-card p-4 space-y-3 ${late ? "border-red-400" : "border-red-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-lg">{alert.restaurantName || "طلب"}</div>
          <div className="text-sm text-muted-foreground truncate">
            #{alert.id.slice(-6)}
            {alert.total ? ` · ${Number(alert.total).toLocaleString("en-US")} ل.س` : ""}
            {alert.address ? ` · ${alert.address}` : ""}
          </div>
        </div>
        <span className={`text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${late ? "bg-red-600 text-white" : "bg-red-100 text-red-800"}`}>
          {late ? "🚨 " : ""}عم يتحضّر من {age} د
        </span>
      </div>

      <div className="rounded-lg bg-muted/50 p-3 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-semibold">١. اطلب الطلب من المطعم</div>
          <div className="text-xs text-muted-foreground">
            {alert.restaurantPhone ? `رقم المطعم: ${alert.restaurantPhone}` : "ما في رقم للمطعم"} · بعد ما تكبس، المندوب ما بيقدر يتصل بالمطعم
          </div>
        </div>
        {alert.restaurantPhone && (
          <a href={`tel:${alert.restaurantPhone}`}>
            <Button variant="outline" size="sm">📞 اتصل</Button>
          </a>
        )}
        {alert.adminOrderedAt ? (
          <span className="text-sm font-bold text-green-700">✓ طلبناه من المطعم</span>
        ) : (
          <Button size="sm" className="bg-green-700 hover:bg-green-800" disabled={ordered.isPending} onClick={() => ordered.mutate()}>
            ✓ طلبناه من المطعم
          </Button>
        )}
      </div>

      <div className="rounded-lg bg-muted/50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">٢. حوّل الطلب لمندوب</div>
          <Button variant="ghost" size="sm" onClick={() => setAssignOpen((v) => !v)}>
            {assignOpen ? "إخفاء" : "عرض أقرب المناديب"}
          </Button>
        </div>
        {assignOpen && (
          options.isLoading ? <div className="text-sm text-muted-foreground">عم نجيب المناديب…</div> :
          list.length === 0 ? <div className="text-sm text-muted-foreground">ما في مناديب متصلين هلق</div> : (
            <>
              <div className="space-y-1">
                {list.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={!o.canTake}
                    onClick={() => setPicked(o.id)}
                    className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-right ${chosen === o.id ? "bg-red-50 ring-1 ring-red-300" : "hover:bg-muted"} ${o.canTake ? "" : "opacity-50 cursor-not-allowed"}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${o.canTake ? "bg-green-500" : "bg-amber-500"}`} />
                    <span className="font-semibold flex-1">{o.name}</span>
                    <span className="text-muted-foreground">{o.distanceKm != null ? `${o.distanceKm} كم عن المطعم` : "بلا موقع"}</span>
                    <span className={o.canTake ? "text-green-700 font-bold" : "text-amber-700 font-bold"}>
                      {o.canTake ? "فاضي" : o.activeOrders > 0 ? "معو طلب" : "مشغول"}
                    </span>
                  </button>
                ))}
              </div>
              <Button className="w-full" disabled={!chosen || assign.isPending} onClick={() => chosen && assign.mutate(chosen)}>
                {chosenName ? `حوّل لـ${chosenName}` : "اختار مندوب"}
              </Button>
            </>
          )
        )}
      </div>
    </div>
  );
}
