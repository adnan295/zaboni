import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: api.getSettings,
  });

  const { data: smsStatus } = useQuery({
    queryKey: ["admin", "sms-status"],
    queryFn: api.getSmsStatus,
  });

  const [gatewayUrl, setGatewayUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sender, setSender] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("POST");

  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const [alertWebhookUrl, setAlertWebhookUrl] = useState("");
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookTestLoading, setWebhookTestLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setGatewayUrl(settings["sms_gateway_url"] ?? "");
      setApiKey(settings["sms_gateway_api_key"] ?? "");
      setSender(settings["sms_gateway_sender"] ?? "");
      setMethod((settings["sms_gateway_method"] as "GET" | "POST") ?? "POST");
      setAlertWebhookUrl(settings["alert_webhook_url"] ?? "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "sms-status"] });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات البوابة بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    saveMutation.mutate({
      sms_gateway_url: gatewayUrl.trim(),
      sms_gateway_api_key: apiKey.trim(),
      sms_gateway_sender: sender.trim(),
      sms_gateway_method: method,
    });
  }

  const webhookSaveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast({ title: "تم الحفظ", description: "تم حفظ رابط الويب هوك بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  function handleWebhookSave() {
    webhookSaveMutation.mutate({ alert_webhook_url: alertWebhookUrl.trim() });
  }

  async function handleWebhookTest() {
    const url = alertWebhookUrl.trim();
    if (!url) {
      toast({ title: "خطأ", description: "يجب إدخال رابط الويب هوك أولاً", variant: "destructive" });
      return;
    }
    setWebhookTestLoading(true);
    setWebhookTestResult(null);
    try {
      const result = await api.testWebhook(url);
      setWebhookTestResult({ ok: true, message: result.message });
      toast({ title: "نجح الاختبار ✓", description: result.message });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setWebhookTestResult({ ok: false, message });
      toast({ title: "فشل الاختبار", description: message, variant: "destructive" });
    } finally {
      setWebhookTestLoading(false);
    }
  }

  async function handleTest() {
    if (!testPhone.trim()) {
      toast({ title: "خطأ", description: "يجب إدخال رقم هاتف للاختبار", variant: "destructive" });
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await api.testSms(testPhone.trim());
      setTestResult({ ok: true, message: result.message });
      toast({ title: "نجح الاختبار ✓", description: result.message });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message });
      toast({ title: "فشل الاختبار", description: message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-muted-foreground text-sm mt-1">إعدادات بوابة SMS والأمان</p>
      </div>

      {/* SMS Gateway Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📱</span>
            <div>
              <CardTitle>بوابة SMS المخصصة</CardTitle>
              <CardDescription>
                اربط بوابة SMS الخاصة بك لإرسال رموز التحقق OTP للمستخدمين
              </CardDescription>
            </div>
            <div className="mr-auto">
              {smsStatus?.smsConfigured ? (
                <Badge variant="default" className="bg-green-600">مُفعَّلة ✓</Badge>
              ) : (
                <Badge variant="destructive">غير مُعدَّة</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="gateway-url">رابط API البوابة (URL)</Label>
            <Input
              id="gateway-url"
              dir="ltr"
              className="text-left font-mono text-sm"
              placeholder="https://sms.example.com/api/send?phone={phone}&msg={message}&key={apiKey}"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              يمكنك استخدام المتغيرات:{" "}
              <code className="bg-muted px-1 rounded">{"{phone}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{message}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{apiKey}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{sender}"}</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">مفتاح API (API Key)</Label>
            <Input
              id="api-key"
              dir="ltr"
              type="password"
              className="text-left font-mono text-sm"
              placeholder="your-api-key-here"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sender">معرف المُرسِل (Sender ID)</Label>
              <Input
                id="sender"
                dir="ltr"
                className="text-left"
                placeholder="+963912345678 أو MARSOOL"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>طريقة الإرسال</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "GET" | "POST")}>
                <SelectTrigger dir="ltr">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST (JSON body)</SelectItem>
                  <SelectItem value="GET">GET (query params)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground mb-1">POST body format:</p>
            <code className="block" dir="ltr">
              {'{ "phone": "...", "message": "...", "apiKey": "...", "sender": "..." }'}
            </code>
            <p className="font-medium text-foreground mt-2 mb-1">GET params format:</p>
            <code className="block" dir="ltr">
              ?phone=...&message=...&apiKey=...&sender=...
            </code>
          </div>

          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full bg-orange-500 hover:bg-orange-600"
          >
            {saveMutation.isPending ? "جاري الحفظ..." : "حفظ إعدادات البوابة"}
          </Button>
        </CardContent>
      </Card>

      {/* Test SMS Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧪</span>
            <div>
              <CardTitle>اختبار البوابة</CardTitle>
              <CardDescription>
                أرسل رسالة تجريبية للتحقق من أن البوابة تعمل بشكل صحيح
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              dir="ltr"
              className="text-left"
              placeholder="+963912345678"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
            <Button
              onClick={handleTest}
              disabled={testLoading}
              variant="outline"
              className="shrink-0"
            >
              {testLoading ? "جاري الإرسال..." : "إرسال اختبار"}
            </Button>
          </div>

          {testResult && (
            <div
              className={`rounded-md p-3 text-sm ${
                testResult.ok
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {testResult.ok ? "✓ " : "✗ "}
              {testResult.message}
            </div>
          )}

          {!smsStatus?.smsConfigured && (
            <p className="text-xs text-muted-foreground">
              ⚠️ البوابة غير مُعدَّة — سيظهر رمز OTP في سجلات السيرفر فقط (وضع التطوير)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Alert Webhook URL Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔔</span>
            <div>
              <CardTitle>رابط تنبيهات الانقطاع (Webhook)</CardTitle>
              <CardDescription>
                عنوان URL يُستخدم لإرسال تنبيهات عند انقطاع اتصال WaVerify — يتم استخدام هذا الرابط بدلاً من متغير البيئة
              </CardDescription>
            </div>
            <div className="mr-auto">
              {alertWebhookUrl.trim() ? (
                <Badge variant="default" className="bg-green-600">مُعدَّل ✓</Badge>
              ) : (
                <Badge variant="secondary">غير مُعدَّل</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="alert-webhook-url">رابط Webhook</Label>
            <Input
              id="alert-webhook-url"
              dir="ltr"
              className="text-left font-mono text-sm"
              placeholder="https://hooks.slack.com/services/..."
              value={alertWebhookUrl}
              onChange={(e) => setAlertWebhookUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              يمكن استخدام Slack Incoming Webhook أو أي خدمة تستقبل طلبات POST بصيغة JSON تحتوي على حقل <code className="bg-muted px-1 rounded">text</code>
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleWebhookSave}
              disabled={webhookSaveMutation.isPending}
              className="flex-1 bg-orange-500 hover:bg-orange-600"
            >
              {webhookSaveMutation.isPending ? "جاري الحفظ..." : "حفظ الرابط"}
            </Button>
            <Button
              onClick={handleWebhookTest}
              disabled={webhookTestLoading || !alertWebhookUrl.trim()}
              variant="outline"
              className="shrink-0"
            >
              {webhookTestLoading ? "جاري الاختبار..." : "اختبار الويب هوك"}
            </Button>
          </div>

          {webhookTestResult && (
            <div
              className={`rounded-md p-3 text-sm ${
                webhookTestResult.ok
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {webhookTestResult.ok ? "✓ " : "✗ "}
              {webhookTestResult.message}
            </div>
          )}

          {!alertWebhookUrl.trim() && (
            <p className="text-xs text-muted-foreground">
              ⚠️ لا يوجد رابط Webhook مُعدَّل — سيتم استخدام متغير البيئة ADMIN_ALERT_WEBHOOK_URL إن وُجد
            </p>
          )}
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔐</span>
            <div>
              <CardTitle>الأمان</CardTitle>
              <CardDescription>حالة مفاتيح التشفير للنظام</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md border">
            <div>
              <p className="font-medium text-sm">مفتاح JWT_SECRET</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                مفتاح تشفير رموز تسجيل الدخول — يجب ضبطه كـ متغير بيئة
              </p>
            </div>
            {smsStatus?.jwtConfigured ? (
              <Badge variant="default" className="bg-green-600 shrink-0">مُعدَّل ✓</Badge>
            ) : (
              <Badge variant="destructive" className="shrink-0">غير مُعدَّل ✗</Badge>
            )}
          </div>

          {!smsStatus?.jwtConfigured && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 space-y-1">
              <p className="font-medium">⚠️ تحذير: JWT_SECRET غير مُعدَّل</p>
              <p className="text-xs">
                التطبيق يستخدم مفتاحاً افتراضياً غير آمن. لضبطه، أضف JWT_SECRET كـ متغير بيئة
                (Environment Variable) في إعدادات النشر.
              </p>
              <p className="text-xs font-mono mt-1 bg-amber-100 px-2 py-1 rounded" dir="ltr">
                JWT_SECRET=your-strong-random-secret-here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
