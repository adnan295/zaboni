import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { timeAgo } from "@/lib/whatsappStatus";

/** Nightly database + files backup to Cloudflare R2 (docker/backup). */
export default function BackupStatusCard() {
  const { data } = useQuery({
    queryKey: ["admin", "backups", "status"],
    queryFn: api.getBackupStatus,
    refetchInterval: 5 * 60_000,
  });
  if (!data) return null;

  const tone = !data.configured
    ? { box: "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20", pill: "bg-amber-500", label: "النسخ الاحتياطي مو مفعّل" }
    : data.healthy
      ? { box: "border-green-200 bg-green-50/40 dark:border-green-900/40 dark:bg-green-950/20", pill: "bg-green-600", label: "النسخ الاحتياطي شغّال" }
      : { box: "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30", pill: "bg-red-600 animate-pulse", label: data.status === "failed" ? "آخر نسخة احتياطية فشلت" : "النسخ الاحتياطي متوقف" };

  return (
    <Card className={tone.box}>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4 text-sm">
        <span className={`h-3 w-3 flex-shrink-0 rounded-full ${tone.pill}`} />
        <span className="font-bold">💾 {tone.label}</span>
        {data.configured ? (
          <span className="text-muted-foreground">
            آخر نسخة ناجحة: {data.lastSuccessAt ? timeAgo(data.lastSuccessAt) : "ولا وحدة"}
            {data.dbBytes > 0 && <> · قاعدة البيانات {(data.dbBytes / 1_048_576).toFixed(1)} ميغا (مشفّرة)</>}
            {" "}· على Cloudflare R2
          </span>
        ) : (
          <span className="text-muted-foreground">بيتفعّل لما تضيف مفاتيح Cloudflare R2 على السيرفر.</span>
        )}
        {data.status === "failed" && data.message && (
          <span className="w-full truncate font-mono text-xs text-red-700 dark:text-red-400" dir="ltr" title={data.message}>
            {data.message}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
