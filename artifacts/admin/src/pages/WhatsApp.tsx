import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type WAAccount } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<WAAccount["status"], string> = {
  connecting: "جاري الاتصال...",
  qr: "في انتظار المسح",
  connected: "متصل ✅",
  disconnected: "منقطع",
};

const STATUS_VARIANT: Record<WAAccount["status"], "default" | "secondary" | "destructive" | "outline"> = {
  connected: "default",
  qr: "secondary",
  connecting: "outline",
  disconnected: "destructive",
};

export default function WhatsApp() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery<WAAccount[]>({
    queryKey: ["admin", "whatsapp", "accounts"],
    queryFn: api.getWhatsAppAccounts,
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: api.addWhatsAppAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "accounts"] });
      toast({ title: "تمت إضافة حساب جديد", description: "امسح الـ QR Code بهاتفك" });
    },
    onError: () => {
      toast({ title: "فشل إضافة الحساب", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => {
      setDisconnectingId(id);
      return api.disconnectWhatsAppAccount(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "accounts"] });
      toast({ title: "تم قطع الاتصال وحذف الحساب" });
    },
    onError: () => {
      toast({ title: "فشل قطع الاتصال", variant: "destructive" });
    },
    onSettled: () => setDisconnectingId(null),
  });

  const connectedCount = accounts.filter((a) => a.status === "connected").length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">واتساب</h1>
          <p className="text-muted-foreground text-sm mt-1">
            إدارة أرقام واتساب لإرسال رموز التحقق OTP
          </p>
        </div>
        <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
          {addMutation.isPending ? "جاري الإضافة..." : "+ إضافة رقم"}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>الأرقام المتصلة:</span>
        <span className="font-bold text-foreground">{connectedCount} / {accounts.length}</span>
        {connectedCount === 0 && accounts.length > 0 && (
          <span className="text-amber-600 mr-2">— الإرسال سيكون عبر SMS كبديل</span>
        )}
      </div>

      {isLoading && (
        <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>
      )}

      {!isLoading && accounts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-4xl mb-3">📱</p>
          <p>لا توجد أرقام مضافة بعد</p>
          <p className="text-sm mt-1">اضغط "+ إضافة رقم" لربط رقم واتساب</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold truncate">
                  {account.phone ?? "رقم غير محدد"}
                </CardTitle>
                <Badge variant={STATUS_VARIANT[account.status]}>
                  {STATUS_LABEL[account.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                أُضيف: {new Date(account.createdAt).toLocaleDateString("ar-SY")}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.status === "qr" && account.qrDataUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={account.qrDataUrl}
                    alt="QR Code للمسح"
                    className="w-48 h-48 rounded border bg-white p-1"
                  />
                  <p className="text-xs text-muted-foreground text-center leading-relaxed">
                    افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← امسح هذا الكود
                  </p>
                </div>
              )}
              {account.status === "connecting" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  جاري الاتصال بواتساب...
                </div>
              )}
              {account.status === "connected" && (
                <p className="text-sm text-green-600 font-medium py-2">
                  ✅ الرقم متصل ويرسل رموز OTP
                </p>
              )}
              {account.status === "disconnected" && (
                <p className="text-sm text-destructive py-2">
                  انقطع الاتصال — أضف الرقم مجدداً لإعادة الربط
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={() => disconnectMutation.mutate(account.id)}
                disabled={disconnectingId === account.id}
              >
                {disconnectingId === account.id ? "جاري الحذف..." : "قطع الاتصال وحذف"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">كيفية العمل</p>
          <ul className="list-disc list-inside space-y-1 mr-2">
            <li>اضغط "+ إضافة رقم" لإنشاء جلسة واتساب جديدة</li>
            <li>امسح الـ QR Code بتطبيق واتساب على هاتفك</li>
            <li>بعد الربط، تُرسَل رموز OTP تلقائياً عبر واتساب</li>
            <li>يمكنك إضافة أكثر من رقم — إذا انقطع أحدها، يُرسَل عبر التالي</li>
            <li>إذا لم يكن أي رقم متصل، يُرسَل عبر SMS كبديل تلقائي</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
