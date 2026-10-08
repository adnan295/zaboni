import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  useWhatsAppAccounts,
  summarizeWhatsApp,
  disconnectReason,
  timeAgo,
  WA_ACCOUNTS_QUERY_KEY,
} from "@/lib/whatsappStatus";

const HEALTH_STYLE = {
  ok: { box: "border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-950/20", pill: "bg-green-600", label: "كل الأرقام شغّالة" },
  no_backup: { box: "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20", pill: "bg-amber-500", label: "شغّال — بس ما في رقم احتياطي" },
  degraded: { box: "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30", pill: "bg-amber-500", label: "في رقم منقطع — الإرسال عبر الباقي" },
  down: { box: "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30", pill: "bg-red-600 animate-pulse", label: "واقف — رموز التحقق ما عم توصل" },
  none: { box: "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30", pill: "bg-red-600 animate-pulse", label: "ما في ولا رقم مربوط" },
} as const;

const DOT: Record<string, string> = {
  connected: "bg-green-500",
  qr: "bg-blue-500",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-red-500",
};

export default function WhatsAppStatusCard() {
  const { data: accounts = [], isLoading, isError, dataUpdatedAt } = useWhatsAppAccounts();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [notifPerm, setNotifPerm] = useState<string>(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  // Re-render every second so "updated X s ago" stays live between polls.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const addMutation = useMutation({
    mutationFn: api.addWhatsAppAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WA_ACCOUNTS_QUERY_KEY });
      navigate("/whatsapp");
    },
  });

  const summary = summarizeWhatsApp(accounts);
  const style = HEALTH_STYLE[summary.health];
  const updatedSec = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <Card className={`shadow-sm border ${isLoading ? "border-border" : isError ? "border-red-300" : style.box}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <div>
              <p className="text-sm font-semibold">واتساب — رموز التحقق</p>
              <p className="text-[11px] text-muted-foreground">
                مباشر · يتحدث كل 5 ثواني
                {updatedSec !== null && ` · آخر تحديث قبل ${updatedSec} ث`}
              </p>
            </div>
          </div>
          {!isLoading && !isError && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold text-white ${style.pill}`}>
              {summary.connected}/{summary.total} · {style.label}
            </span>
          )}
          {isError && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
              تعذّر الاتصال بالسيرفر
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        ) : (
          accounts.length > 0 && (
            <div className="divide-y divide-border rounded-md border bg-background/60">
              {accounts.map((a) => {
                const reason = disconnectReason(a);
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${DOT[a.status]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium" dir="ltr" style={{ textAlign: "right" }}>
                        {a.phone ?? "رقم جديد (غير مربوط)"}
                      </p>
                      <p className={`text-xs ${reason ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                        {reason ??
                          `متصل · ${a.sentCount ?? 0} رسالة منذ آخر تشغيل · آخر إرسال ${timeAgo(a.lastSentAt)}`}
                      </p>
                    </div>
                    {a.status !== "connected" && a.lastConnectedAt && (
                      <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                        آخر اتصال {timeAgo(a.lastConnectedAt)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {summary.health === "no_backup" && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            💡 ضيف رقم تاني كاحتياطي: إذا انحظر أو وقف الرقم الحالي، الإرسال بيتحوّل للرقم التاني تلقائياً بدون ما يحس الزبون.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {addMutation.isPending ? "جاري الإضافة..." : "+ إضافة رقم احتياطي"}
          </button>
          <Link
            href="/whatsapp"
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            إدارة الأرقام
          </Link>
          {notifPerm === "default" && (
            <button
              onClick={() => {
                void Notification.requestPermission().then(setNotifPerm);
              }}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              🔔 فعّل تنبيهات المتصفح
            </button>
          )}
          {notifPerm === "denied" && (
            <span className="self-center text-[11px] text-muted-foreground">
              تنبيهات المتصفح محظورة — فعّلها من إعدادات الموقع بالمتصفح
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
