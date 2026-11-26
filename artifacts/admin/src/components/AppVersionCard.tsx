import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * App updates (api-server lib/appVersion). Old apps are never refused.
 *  • «أحدث نسخة»: apps older than it suggest updating once («بعدين» closes it).
 *  • «تحديث إجباري»: emergency only — apps below it show an update page and cannot order.
 */
export default function AppVersionCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin", "app-version"], queryFn: api.getAppVersion });
  const [latest, setLatest] = useState<string | null>(null);
  const [min, setMin] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: api.saveAppVersion,
    onSuccess: (v) => { qc.setQueryData(["admin", "app-version"], v); setLatest(null); setMin(null); toast({ title: "انحفظ" }); },
    onError: () => toast({ title: "ما انحفظ: اكتب النسخة متل 1.0.23", variant: "destructive" }),
  });
  if (!data) return null;
  const l = latest ?? data.latest ?? "", m = min ?? data.version;
  const valid = (!l || VERSION.test(l)) && VERSION.test(m);
  const dirty = l !== (data.latest ?? "") || m !== data.version;
  const body = (over: Partial<typeof data> = {}) => ({ enabled: data.enabled, version: m, ...(l ? { latest: l } : {}), ...over });
  return (
    <Card className="shadow-sm">
      <CardContent className="py-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="font-semibold">تحديث التطبيق</div>
        <span className="text-muted-foreground">أحدث نسخة بالمتاجر:</span>
        <input value={l} onChange={(e) => setLatest(e.target.value.trim())} placeholder="1.0.23" dir="ltr" className="w-24 border rounded-md px-2 py-1 bg-background" />
        <span className="text-xs text-muted-foreground">(الأقدم منها بتطلعلو رسالة «في نسخة جديدة» مرة وحدة)</span>
        <div className="flex items-center gap-2 mr-auto">
          <Switch checked={data.enabled} onCheckedChange={(enabled) => save.mutate(body({ enabled }))} disabled={save.isPending} />
          <span className={data.enabled ? "font-bold text-red-700" : "text-muted-foreground"}>تحديث إجباري (للطوارئ بس) لأقل من</span>
          <input value={m} onChange={(e) => setMin(e.target.value.trim())} dir="ltr" className="w-24 border rounded-md px-2 py-1 bg-background" />
          {dirty && <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate(body())}>حفظ</Button>}
        </div>
        <div className="basis-full text-xs text-muted-foreground">
          النسخ القديمة (قبل 1.0.23) ما بتنمنع أبداً وبتضل تشتغل متل قبل. التحديث الإجباري بيأثّر بس على نسخ 1.0.23 وما بعد.
        </div>
      </CardContent>
    </Card>
  );
}
