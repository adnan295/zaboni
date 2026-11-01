import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

/** On/off for the direct Android download at zaboni.site/download (setting: direct_apk_enabled). */
export default function DirectDownloadCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin", "settings"], queryFn: api.getSettings });
  const enabled = settings?.["direct_apk_enabled"] === "true";
  const save = useMutation({
    mutationFn: (on: boolean) => api.updateSettings({ direct_apk_enabled: on ? "true" : "false" }),
    onSuccess: (_d, on) => {
      void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast({ title: on ? "التحميل المباشر صار شغّال" : "التحميل المباشر توقّف", description: "بيتطبّق على الموقع خلال نص دقيقة." });
    },
    onError: () => toast({ title: "ما انحفظ التغيير", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>📲 التحميل المباشر لأندرويد</CardTitle>
        <CardDescription>
          zaboni.site/download — للناس يلي ما بيوصلو لغوغل بلاي. لما يكون موقّف، بيختفي زر التحميل المباشر من الموقع وبتبيّن
          صفحة التحميل إنو متوقف مؤقتاً.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <span className={`text-sm font-bold ${enabled ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
          {enabled ? "شغّال" : "متوقف"}
        </span>
        <Switch checked={enabled} disabled={!settings || save.isPending} onCheckedChange={(on) => save.mutate(on)} />
      </CardContent>
    </Card>
  );
}
