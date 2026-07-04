import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type Mode = "password" | "otp-request" | "otp-verify";

export default function Login({ onLogin }: { onLogin: (name?: string) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login({ phone, password });
      setToken(res.token);
      onLogin(res.restaurant?.nameAr ?? res.restaurant?.name);
    } catch (err) {
      toast({ variant: "destructive", title: "خطأ", description: String(err instanceof Error ? err.message : err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.requestOtp(phone);
      if (res.devCode) {
        toast({ title: "رمز OTP (تطوير)", description: `الرمز: ${res.devCode}` });
      } else {
        toast({ title: "تم الإرسال", description: "تم إرسال رمز OTP إلى هاتفك" });
      }
      setMode("otp-verify");
    } catch (err) {
      toast({ variant: "destructive", title: "خطأ", description: String(err instanceof Error ? err.message : err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.verifyOtp({ phone, code: otp });
      setToken(res.token);
      onLogin(res.restaurant?.nameAr ?? res.restaurant?.name);
    } catch (err) {
      toast({ variant: "destructive", title: "خطأ", description: String(err instanceof Error ? err.message : err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
            🍽️
          </div>
          <h1 className="text-2xl font-bold text-foreground">بوابة المطاعم</h1>
          <p className="text-muted-foreground mt-1 text-sm">سجّل دخولك لإدارة مطعمك</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {mode === "password" && "تسجيل الدخول بكلمة المرور"}
              {mode === "otp-request" && "تسجيل الدخول بـ OTP"}
              {mode === "otp-verify" && "أدخل رمز التحقق"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mode === "password" && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1">
                  <Label>رقم الهاتف</Label>
                  <Input dir="ltr" placeholder="+963..." value={phone} onChange={e => setPhone(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>كلمة المرور</Label>
                  <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "جاري الدخول..." : "دخول"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  يعتمد مطعمك على OTP؟{" "}
                  <button type="button" className="text-primary underline" onClick={() => setMode("otp-request")}>
                    تسجيل بـ OTP
                  </button>
                </p>
              </form>
            )}

            {mode === "otp-request" && (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div className="space-y-1">
                  <Label>رقم الهاتف</Label>
                  <Input dir="ltr" placeholder="+963..." value={phone} onChange={e => setPhone(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "جاري الإرسال..." : "إرسال رمز OTP"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  <button type="button" className="text-primary underline" onClick={() => setMode("password")}>
                    عودة لكلمة المرور
                  </button>
                </p>
              </form>
            )}

            {mode === "otp-verify" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-sm text-muted-foreground">تم إرسال رمز إلى <strong dir="ltr">{phone}</strong></p>
                <div className="space-y-1">
                  <Label>رمز OTP</Label>
                  <Input dir="ltr" placeholder="123456" value={otp} onChange={e => setOtp(e.target.value)} required maxLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "جاري التحقق..." : "تحقق ودخول"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  <button type="button" className="text-primary underline" onClick={() => setMode("otp-request")}>
                    إعادة إرسال الرمز
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
