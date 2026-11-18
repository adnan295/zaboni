import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

/** On/off for the WhatsApp map links sent to couriers (setting: courier_whatsapp_directions, on by default). */
export default function CourierDirectionsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin", "settings"], queryFn: api.getSettings });
  const enabled = settings?.["courier_whatsapp_directions"] !== "false";
  const save = useMutation({
    mutationFn: (on: boolean) => api.updateSettings({ courier_whatsapp_directions: on ? "true" : "false" }),
    onSuccess: (_d, on) => {
      void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast({ title: on ? "إرسال المواقع للمناديب صار شغّال" : "إرسال المواقع للمناديب توقّف" });
    },
    onError: () => toast({ title: "ما انحفظ التغيير", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>🗺 موقع الطلب على واتساب المندوب</CardTitle>
        <CardDescription>
          لما المندوب يقبل طلب بتوصله رسالة واتساب فيها رابط خريطة للمطعم، ولما يكبس «استلمت الطلب» بتوصله رسالة تانية
          بموقع الزبون. الرابط بيفتح خرائط غوغل أو آبل مباشرة، وهيك بيمشي الحال حتى مع الأيفون.
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
