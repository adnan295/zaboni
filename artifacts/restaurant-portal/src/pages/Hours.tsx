import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RestaurantHour } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DEFAULT_HOURS: RestaurantHour[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  openTime: "09:00",
  closeTime: "22:00",
  isClosed: i === 5,
}));

export default function Hours() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [hours, setHours] = useState<RestaurantHour[]>(DEFAULT_HOURS);

  const { data, isLoading } = useQuery({ queryKey: ["portal-hours"], queryFn: api.getHours });

  useEffect(() => {
    if (data && data.length > 0) {
      const filled = Array.from({ length: 7 }, (_, i) => {
        const found = data.find(h => h.dayOfWeek === i);
        return found ?? { dayOfWeek: i, openTime: "09:00", closeTime: "22:00", isClosed: false };
      });
      setHours(filled);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateHours(hours),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-hours"] });
      toast({ title: "تم حفظ أوقات العمل" });
    },
    onError: (e) => toast({ variant: "destructive", title: "خطأ", description: String(e instanceof Error ? e.message : e) }),
  });

  const update = (i: number, field: keyof RestaurantHour, value: string | boolean) => {
    setHours(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: value } : h));
  };

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">حدد أوقات العمل لكل يوم من أيام الأسبوع.</p>

      <div className="space-y-2">
        {hours.map((h, i) => (
          <Card key={h.dayOfWeek} className={h.isClosed ? "opacity-60" : ""}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`closed-${i}`}
                  checked={!h.isClosed}
                  onChange={e => update(i, "isClosed", !e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor={`closed-${i}`} className="w-16 text-sm font-medium cursor-pointer">{DAY_NAMES[i]}</label>

                <div className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">من</span>
                    <Input
                      type="time"
                      value={h.openTime}
                      disabled={h.isClosed}
                      onChange={e => update(i, "openTime", e.target.value)}
                      className="w-28 text-sm"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">إلى</span>
                    <Input
                      type="time"
                      value={h.closeTime}
                      disabled={h.isClosed}
                      onChange={e => update(i, "closeTime", e.target.value)}
                      className="w-28 text-sm"
                      dir="ltr"
                    />
                  </div>
                </div>

                {h.isClosed && <span className="text-xs text-muted-foreground">مغلق</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "جاري الحفظ..." : "💾 حفظ الأوقات"}
      </Button>
    </div>
  );
}
