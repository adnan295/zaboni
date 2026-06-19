import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type RestaurantAccount = {
  id: string;
  restaurantId: string;
  phone: string;
  authMode: "password" | "otp";
  isActive: boolean;
  createdAt: string;
  restaurantName: string;
};

type RestaurantOption = { id: string; nameAr: string; name: string };

type FormData = {
  restaurantId: string;
  phone: string;
  password: string;
  authMode: "password" | "otp";
  isActive: boolean;
};

const emptyForm: FormData = { restaurantId: "", phone: "", password: "", authMode: "password", isActive: true };

export default function RestaurantAccounts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editAccount, setEditAccount] = useState<(Partial<RestaurantAccount> & { _form?: FormData }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: accounts = [], isLoading } = useQuery<RestaurantAccount[]>({
    queryKey: ["admin", "restaurant-accounts"],
    queryFn: () => api.get("/admin/restaurant-accounts"),
  });

  const { data: restaurants = [] } = useQuery<RestaurantOption[]>({
    queryKey: ["admin", "restaurants-list"],
    queryFn: () => api.get("/admin/restaurants"),
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormData & { id?: string }) => {
      if (data.id) {
        const { id, ...body } = data;
        return api.patch(`/admin/restaurant-accounts/${id}`, body);
      }
      return api.post("/admin/restaurant-accounts", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-accounts"] });
      setEditAccount(null);
      setForm(emptyForm);
      toast({ title: "تم الحفظ" });
    },
    onError: (e) => toast({ variant: "destructive", title: "خطأ", description: String(e instanceof Error ? e.message : e) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/admin/restaurant-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-accounts"] });
      setDeleteId(null);
      toast({ title: "تم الحذف" });
    },
  });

  const filtered = accounts.filter(a =>
    a.phone.includes(search) || a.restaurantName.includes(search)
  );

  function openCreate() {
    setForm(emptyForm);
    setEditAccount({});
  }

  function openEdit(a: RestaurantAccount) {
    setForm({ restaurantId: a.restaurantId, phone: a.phone, password: "", authMode: a.authMode, isActive: a.isActive });
    setEditAccount(a);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h1 className="text-xl font-bold">حسابات المطاعم</h1>
        <Button onClick={openCreate}>+ إضافة حساب</Button>
      </div>

      <Input
        placeholder="بحث برقم الهاتف أو اسم المطعم..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">لا توجد حسابات</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(account => (
            <Card key={account.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{account.restaurantName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{account.phone}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={account.authMode === "otp" ? "outline" : "secondary"}>
                      {account.authMode === "otp" ? "OTP" : "كلمة مرور"}
                    </Badge>
                    <Badge variant={account.isActive ? "default" : "destructive"}>
                      {account.isActive ? "نشط" : "معطل"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openEdit(account)}>تعديل</Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteId(account.id)}>حذف</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editAccount} onOpenChange={open => !open && setEditAccount(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editAccount?.id ? "تعديل حساب المطعم" : "إنشاء حساب مطعم"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>المطعم *</Label>
              <Select value={form.restaurantId} onValueChange={v => setForm(p => ({ ...p, restaurantId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مطعماً..." />
                </SelectTrigger>
                <SelectContent>
                  {restaurants.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.nameAr} ({r.name})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>رقم الهاتف *</Label>
              <Input dir="ltr" placeholder="+963..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>طريقة المصادقة</Label>
              <Select value={form.authMode} onValueChange={v => setForm(p => ({ ...p, authMode: v as "password" | "otp" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="password">كلمة مرور</SelectItem>
                  <SelectItem value="otp">OTP (رمز مؤقت)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.authMode === "password" && (
              <div className="space-y-1">
                <Label>{editAccount?.id ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور *"}</Label>
                <Input type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
              <Label htmlFor="isActive">حساب نشط</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAccount(null)}>إلغاء</Button>
            <Button
              disabled={saveMutation.isPending || !form.restaurantId || !form.phone || (form.authMode === "password" && !editAccount?.id && !form.password)}
              onClick={() => saveMutation.mutate({ ...form, id: editAccount?.id })}
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا الحساب؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
