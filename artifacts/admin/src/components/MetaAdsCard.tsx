import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * Facebook ads (Meta Conversions API, api-server routes/metaAdmin.ts): new sign-ups and
 * delivered orders go to the dataset so campaigns learn who really orders. The token is
 * pasted here once and never shown again (only its last 4 characters).
 */
export default function MetaAdsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["admin", "meta-ads"], queryFn: api.getMetaAds });
  const [pixel, setPixel] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [rate, setRate] = useState<string | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: api.saveMetaAds,
    onSuccess: (v) => {
      qc.setQueryData(["admin", "meta-ads"], v);
      setPixel(null); setToken(""); setRate(null); setCheck(null);
      toast({ title: "انحفظ" });
    },
    onError: () => toast({ title: "ما انحفظ: تأكد من رقم البكسل والرمز", variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: api.checkMetaAds,
    onSuccess: (r) => setCheck(r.ok
      ? { ok: true, text: `✓ الرمز شغّال ومربوط بـ «${r.name}». الطلبات والتسجيلات عم تنبعت لفيس بوك.` }
      : { ok: false, text: r.error === "missing" ? "لازم رقم البكسل والرمز." : `✗ فيس بوك رفض الرمز: ${r.error}` }),
  });

  if (!data) return null;
  const p = pixel ?? data.pixelId;
  const r = rate ?? String(data.sypPerUsd);
  const dirty = p !== data.pixelId || token.trim() !== "" || r !== String(data.sypPerUsd);
  const valid = /^\d{5,20}$/.test(p) && (token.trim() === "" || /^[A-Za-z0-9_-]{20,600}$/.test(token.trim())) && Number(r) > 0;

  return (
    <Card className="shadow-sm">
      <CardContent className="py-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="font-semibold">إعلانات فيس بوك</div>
        <span className={data.active ? "text-green-700 font-semibold" : "text-muted-foreground"}>
          {data.active ? "● شغّال" : "○ مطفي"}
        </span>
        <span className="text-muted-foreground">رقم البكسل:</span>
        <input value={p} onChange={(e) => setPixel(e.target.value.trim())} dir="ltr" placeholder="1170322125473647"
          className="w-44 border rounded-md px-2 py-1 bg-background" disabled={data.pixelFromFile} />
        <span className="text-muted-foreground">رمز الوصول:</span>
        <input value={token} onChange={(e) => setToken(e.target.value)} dir="ltr" type="password" autoComplete="off"
          placeholder={data.hasToken ? `محفوظ …${data.tokenEnd} (الصق رمز جديد لتبدّلو)` : "الصق الرمز هون"}
          className="w-72 border rounded-md px-2 py-1 bg-background" disabled={data.tokenFromFile} />
        <span className="text-muted-foreground">ل.س للدولار:</span>
        <input value={r} onChange={(e) => setRate(e.target.value.trim())} dir="ltr" inputMode="decimal"
          className="w-20 border rounded-md px-2 py-1 bg-background" />
        <div className="flex items-center gap-2 mr-auto">
          {dirty && (
            <Button size="sm" disabled={!valid || save.isPending}
              onClick={() => save.mutate({ pixelId: p, ...(token.trim() ? { token: token.trim() } : {}), sypPerUsd: Number(r) })}>
              حفظ
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!data.active || test.isPending || dirty} onClick={() => test.mutate()}>
            {test.isPending ? "عم جرّب…" : "جرّب الربط"}
          </Button>
        </div>
        {check && <div className={`basis-full text-xs ${check.ok ? "text-green-700" : "text-red-700"}`}>{check.text}</div>}
        <div className="basis-full text-xs text-muted-foreground">
          بيبعت لفيس بوك كل تسجيل جديد وكل طلب انتسلّم (بقيمتو بالدولار)، وأرقام الموبايلات بتطلع مشفّرة بس.
          الرمز من Events Manager ← Zaboni ← الإعدادات ← «إنشاء رمز وصول». بعد ما ينحفظ ما بيبيّن مرة تانية.
          {(data.pixelFromFile || data.tokenFromFile) && " (يلي ما بتنكتب خانتو مأخوذ من ملف .env عالسيرفر.)"}
        </div>
      </CardContent>
    </Card>
  );
}
