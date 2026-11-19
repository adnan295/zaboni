import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("ar-SY", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
const windowLabel = (w: string) => w.split("-").map((h) => (Number(h) > 12 ? Number(h) - 12 : Number(h))).join(" - ");

function Cell({ mealId, day, portions, sold }: { mealId: string; day: string; portions: number; sold: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [v, setV] = useState(portions ? String(portions) : "");
  useEffect(() => { setV(portions ? String(portions) : ""); }, [portions]);
  const save = useMutation({
    mutationFn: (n: number) => api.setKitchenPortions(mealId, day, n),
    onSuccess: (out, n) => {
      qc.invalidateQueries({ queryKey: ["portal-kitchen"] });
      if (out.portions > n) toast({ title: `مباع منها ${out.sold}، فما بتنزل تحت هالرقم` });
    },
    onError: (e) => toast({ variant: "destructive", title: "ما انحفظ", description: String(e instanceof Error ? e.message : e) }),
  });
  const commit = () => { const n = Math.max(0, Math.floor(Number(v) || 0)); if (n !== portions) save.mutate(n); };
  return (
    <td className="px-1 py-1.5 text-center">
      <Input className={`mx-auto h-9 w-16 text-center ${portions > 0 ? "border-green-500" : ""}`} type="number" min={0} inputMode="numeric" value={v} placeholder="—"
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {sold > 0 && <div className="text-[11px] font-bold text-green-700">مطلوب {sold}</div>}
    </td>
  );
}

/** The cook sets how many portions she will make each day and sees what to cook next. */
export default function KitchenDays() {
  const { data, isLoading } = useQuery({ queryKey: ["portal-kitchen"], queryFn: api.getKitchen, refetchInterval: 60_000 });
  const map = useMemo(() => new Map((data?.isKitchen ? data.mealDays : []).map((d) => [`${d.mealId}|${d.day}`, d])), [data]);
  if (isLoading) return <div className="py-20 text-center text-muted-foreground">جاري التحميل...</div>;
  if (!data?.isKitchen) return <p className="text-muted-foreground">هالصفحة لمطابخ الطلب المسبق بس.</p>;
  const summaries = data.summaries.filter((s): s is NonNullable<typeof s> => !!s);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        اكتبي كم حصة رح تطبخي من كل وجبة بكل يوم. الوجبة بتبيّن للزبائن بس باليوم اللي إلها فيه حصص. الطلب لكل يوم بيسكّر المسا اللي قبله، وبتوصلك رسالة واتساب بالعدد النهائي.
      </p>

      {summaries.map((s) => (
        <Card key={s.day} className="border-green-400">
          <CardContent className="py-3">
            <div className="font-bold">المطلوب ليوم {dayLabel(s.day)}: {s.orders} طلب</div>
            <ul className="mt-1 text-sm">{s.lines.map((l) => <li key={l.nameAr}>{l.nameAr} × <b>{l.qty}</b></li>)}</ul>
            <div className="mt-1 text-xs text-muted-foreground">مواعيد التسليم للمندوب: {s.byWindow.map((w) => `${windowLabel(w.window)} (${w.orders})`).join(" · ")}</div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {data.meals.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ضيفي وجباتك من «قائمة الطعام» أول.</p> : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-xs">
                <tr>
                  <th className="px-3 py-2 text-right">الوجبة</th>
                  {data.days.map((d) => <th key={d.day} className="px-1 py-2 text-center">{dayLabel(d.day)}{!d.open && <div className="font-normal text-red-600">سكّر الطلب</div>}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.meals.filter((m) => m.isAvailable).map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 font-medium">{m.nameAr}</td>
                    {data.days.map((d) => { const c = map.get(`${m.id}|${d.day}`); return <Cell key={d.day} mealId={m.id} day={d.day} portions={c?.portions ?? 0} sold={c?.sold ?? 0} />; })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
