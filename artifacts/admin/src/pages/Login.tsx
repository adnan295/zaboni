import { useState } from "react";
import { api, setAdminToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const ok = await api.verifyToken(secret.trim());
      if (ok) {
        setAdminToken(secret.trim());
        onLogin();
      } else {
        setError("كلمة المرور غير صحيحة أو لوحة الإدارة غير مهيأة.");
      }
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center text-2xl">
            🚀
          </div>
          <CardTitle className="text-2xl font-bold">زبوني</CardTitle>
          <CardDescription>لوحة الإدارة — أدخل كلمة المرور للمتابعة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="secret">كلمة المرور السرية</Label>
              <Input
                id="secret"
                type="password"
                autoComplete="current-password"
                placeholder="أدخل كلمة المرور..."
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={loading || !secret.trim()}
            >
              {loading ? "جاري التحقق..." : "تسجيل الدخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
