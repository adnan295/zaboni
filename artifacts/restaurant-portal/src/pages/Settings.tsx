import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Restaurant } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: restaurant, isLoading } = useQuery({ queryKey: ["portal-me"], queryFn: api.getMe });
  const [form, setForm] = useState<Partial<Restaurant>>({});

  useEffect(() => {
    if (restaurant) setForm(restaurant);
  }, [restaurant]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateRestaurant(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-me"] });
      qc.invalidateQueries({ queryKey: ["portal-stats"] });
      toast({ title: "تم حفظ البيانات بنجاح" });
    },
    onError: (e) => toast({ variant: "destructive", title: "خطأ", description: String(e instanceof Error ? e.message : e) }),
  });

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader><CardTitle>معلومات المطعم</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>الاسم بالعربية *</Label>
              <Input value={form.nameAr ?? ""} onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>الاسم بالإنجليزية</Label>
              <Input dir="ltr" value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>رقم الهاتف</Label>
            <Input dir="ltr" placeholder="+963..." value={form.phone ?? ""} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <Label>رابط صورة المطعم</Label>
            <Input dir="ltr" placeholder="https://..." value={form.image ?? ""} onChange={e => setForm(p => ({ ...p, image: e.target.value }))} />
            {form.image && (
              <img src={form.image} alt="preview" className="mt-2 w-full max-h-48 object-cover rounded-lg border" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>إعدادات التوصيل</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>رسوم التوصيل (ل.س)</Label>
              <Input type="number" min="0" value={form.deliveryFee ?? 0} onChange={e => setForm(p => ({ ...p, deliveryFee: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label>الحد الأدنى للطلب (ل.س)</Label>
              <Input type="number" min="0" value={form.minOrder ?? 0} onChange={e => setForm(p => ({ ...p, minOrder: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>وقت التوصيل المتوقع</Label>
            <Input dir="ltr" placeholder="30-45 دقيقة" value={form.deliveryTime ?? ""} onChange={e => setForm(p => ({ ...p, deliveryTime: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.nameAr}>
        {saveMutation.isPending ? "جاري الحفظ..." : "💾 حفظ التغييرات"}
      </Button>
    </div>
  );
}
