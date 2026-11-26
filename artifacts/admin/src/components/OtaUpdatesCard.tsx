import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const when = (iso: string) => new Date(iso).toLocaleString("ar-SY", { dateStyle: "medium", timeStyle: "short" });

/**
 * Over-the-air updates (api-server routes/ota.ts): what each store version
 * currently runs, and a way back if an update misbehaves. Phones pick up the
 * change on their next launch. Publishing is the GitHub workflow «Zaboni OTA update».
 */
export default function OtaUpdatesCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin", "ota"], queryFn: api.getOtaUpdates, refetchInterval: 60_000 });
  const back = useMutation({
    mutationFn: ({ runtime, platform }: { runtime: string; platform: string }) => api.rollbackOta(runtime, platform),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin", "ota"] });
      toast({ title: r.id ? "رجعنا للتحديث يلي قبلو" : "رجعنا لنسخة المتجر بدون تحديثات" });
    },
    onError: () => toast({ title: "ما زبط الرجوع، جرّب مرة تانية", variant: "destructive" }),
  });
  const targets = data?.targets ?? [];
  if (targets.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">التحديثات عن بعد</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {targets.map((t) => {
          const cur = t.history.find((h) => h.id === t.currentId);
          return (
            <div key={`${t.runtime}-${t.platform}`} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <b dir="ltr">{t.platform === "ios" ? "iPhone" : "Android"} {t.runtime}</b>
              <span className="text-muted-foreground flex-1 min-w-[200px]">
                {cur ? `شغّال: ${cur.message || "تحديث"} · ${when(cur.createdAt)}` : "شغّال: نسخة المتجر بدون تحديثات"}
              </span>
              {t.currentId && (
                <Button size="sm" variant="outline" disabled={back.isPending}
                  onClick={() => { if (confirm("ترجع عن هالتحديث؟ الجوالات بتاخد الرجوع بأول فتحة للتطبيق.")) back.mutate({ runtime: t.runtime, platform: t.platform }); }}>
                  ↩︎ رجوع
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
