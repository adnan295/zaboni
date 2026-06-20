import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Loyalty() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin", "loyalty-settings"],
    queryFn: api.getLoyaltySettings,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "loyalty-users"],
    queryFn: api.getLoyaltyUsers,
  });

  const [earnRate, setEarnRate] = useState<string>("");
  const [pointValue, setPointValue] = useState<string>("");

  const hasInit = settings !== undefined;
  const displayEarnRate = earnRate !== "" ? earnRate : String(settings?.earnRate ?? "10");
  const displayPointValue = pointValue !== "" ? pointValue : String(settings?.pointValue ?? "1");

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveLoyaltySettings({
        earnRate: Number(displayEarnRate),
        pointValue: Number(displayPointValue),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "loyalty-settings"] });
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات الولاء بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "تعذّر حفظ الإعدادات", variant: "destructive" });
    },
  });

  const totalPoints = users.reduce((s, u) => s + (u.loyaltyPoints ?? 0), 0);
  const usersWithPoints = users.filter((u) => (u.loyaltyPoints ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">نظام الولاء والمكافآت</h1>

      <div className="flex gap-4 flex-wrap">
        <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-purple-600">{totalPoints.toLocaleString()}</p>
          <p className="text-xs text-purple-600/70 font-medium">إجمالي النقاط الممنوحة</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
          <p className="text-2xl font-bold text-green-600">{usersWithPoints}</p>
          <p className="text-xs text-green-600/70 font-medium">عملاء لديهم نقاط</p>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4 max-w-md">
        <h2 className="text-lg font-bold">إعدادات الولاء</h2>

        {settingsLoading ? (
          <p className="text-muted-foreground">جاري التحميل...</p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                معدل الكسب <span className="text-muted-foreground">(نقاط لكل 1,000 ل.س من قيمة الطلب)</span>
              </label>
              <Input
                type="number"
                min={0}
                max={1000}
                value={displayEarnRate}
                onChange={(e) => setEarnRate(e.target.value)}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">
                مثال: 10 ← العميل يكسب 10 نقاط عن كل 1,000 ل.س في الطلب
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                قيمة النقطة <span className="text-muted-foreground">(ل.س عند الاستبدال)</span>
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={displayPointValue}
                onChange={(e) => setPointValue(e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                مثال: 1 ← 500 نقطة = خصم 500 ل.س
              </p>
            </div>

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasInit}
              className="w-full"
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold">أرصدة العملاء</h2>
        {usersLoading ? (
          <p className="text-muted-foreground">جاري التحميل...</p>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground">لا يوجد عملاء بعد.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">الهاتف</th>
                  <th className="text-right px-4 py-3 font-medium">النقاط</th>
                  <th className="text-right px-4 py-3 font-medium">قيمة الخصم</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{u.name || <span className="text-muted-foreground italic">بدون اسم</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">{u.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${(u.loyaltyPoints ?? 0) > 0 ? "text-purple-600" : "text-muted-foreground"}`}>
                        {(u.loyaltyPoints ?? 0).toLocaleString()} نقطة
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {((u.loyaltyPoints ?? 0) * (settings?.pointValue ?? 1)).toLocaleString()} ل.س
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
