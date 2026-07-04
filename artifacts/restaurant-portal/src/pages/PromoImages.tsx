import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromoImage, type PromoTemplate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const LAYOUT_LABELS: Record<string, string> = {
  A: "كلاسيك — نص يسار، صورة يمين",
  B: "هيدر — شعار + كوبون تذكرة",
  C: "تغطية كاملة — الطعام خلفية",
  D: "بطاقة — صورة دائرية أنيقة",
};

export default function PromoImages() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [foodObjectPath, setFoodObjectPath] = useState("");
  const [foodPreview, setFoodPreview] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [tagline, setTagline] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [generatedTemplateName, setGeneratedTemplateName] = useState("");

  const { data: templates = [] } = useQuery<PromoTemplate[]>({
    queryKey: ["promo-templates"],
    queryFn: api.getPromoTemplates,
    staleTime: Infinity,
  });

  const { data: history = [] } = useQuery<PromoImage[]>({
    queryKey: ["promo-images"],
    queryFn: api.getPromoImages,
    refetchInterval: 60_000,
  });

  function getTemplateName(templateId: string): string {
    return templates.find(t => t.id === templateId)?.nameAr ?? templateId;
  }

  const groups = templates.reduce<Record<string, PromoTemplate[]>>((acc, t) => {
    const g = t.layoutGroup ?? "A";
    if (!acc[g]) acc[g] = [];
    acc[g]!.push(t);
    return acc;
  }, {});

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ variant: "destructive", title: "نوع الملف غير مدعوم", description: "يُسمح بـ JPG, PNG, WebP فقط" });
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast({ variant: "destructive", title: "الملف كبير جداً", description: `الحد الأقصى ${MAX_FILE_MB} ميغابايت` });
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("restaurant_portal_token") ?? ""}`,
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res.ok) throw new Error("فشل الحصول على رابط الرفع");
      const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setFoodObjectPath(objectPath);
      setFoodPreview(URL.createObjectURL(file));
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الرفع", description: String(err instanceof Error ? err.message : err) });
    } finally {
      setUploading(false);
    }
  }

  const generateMutation = useMutation({
    mutationFn: () => api.generatePromoImage({
      foodObjectPath: foodObjectPath || undefined,
      oldPrice,
      newPrice,
      tagline: tagline || undefined,
      couponCode: couponCode || undefined,
      templateId: selectedTemplateId,
    }),
    onSuccess: (data) => {
      setGeneratedUrl(data.resultUrl);
      setGeneratedTemplateName(data.templateName);
      qc.invalidateQueries({ queryKey: ["promo-images"] });
      toast({ title: "تم توليد البوستر بنجاح!" });
    },
    onError: (e) => toast({ variant: "destructive", title: "خطأ في التوليد", description: String(e instanceof Error ? e.message : e) }),
  });

  const canGenerate = selectedTemplateId && oldPrice.trim() && newPrice.trim() && !generateMutation.isPending && !uploading;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>إنشاء بوستر ترويجي</CardTitle>
          <p className="text-sm text-muted-foreground">اختر قالباً، ارفع صورة الوجبة، وأدخل تفاصيل العرض</p>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* ── Template Picker ── */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              اختر القالب <span className="text-destructive">*</span>
            </Label>

            {templates.length === 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groups).map(([group, groupTemplates]) => (
                  <div key={group}>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 pb-1 border-b">
                      {LAYOUT_LABELS[group] ?? group}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {groupTemplates.map(t => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          selected={selectedTemplateId === t.id}
                          onSelect={() => setSelectedTemplateId(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!selectedTemplateId && templates.length > 0 && (
              <p className="text-xs text-muted-foreground/70">يرجى اختيار قالب قبل التوليد</p>
            )}
          </div>

          {/* ── Food image upload ── */}
          <div className="space-y-2">
            <Label>صورة الوجبة (اختياري)</Label>
            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {foodPreview ? (
                <img src={foodPreview} alt="preview" className="mx-auto max-h-40 rounded-lg object-cover" />
              ) : (
                <div className="text-muted-foreground">
                  <div className="text-3xl mb-2">🖼️</div>
                  <p className="text-sm">{uploading ? "جاري الرفع..." : "انقر لرفع صورة الوجبة"}</p>
                  <p className="text-xs mt-1">JPG، PNG، WebP — حتى {MAX_FILE_MB} ميغابايت</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {foodPreview && (
              <button
                className="text-xs text-muted-foreground underline"
                onClick={() => { setFoodPreview(""); setFoodObjectPath(""); }}
              >
                إزالة الصورة
              </button>
            )}
          </div>

          {/* ── Prices ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>السعر الأصلي <span className="text-destructive">*</span></Label>
              <Input
                placeholder="مثال: 25000 ل.س"
                value={oldPrice}
                onChange={e => setOldPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>السعر بعد الخصم <span className="text-destructive">*</span></Label>
              <Input
                placeholder="مثال: 18000 ل.س"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
              />
            </div>
          </div>

          {/* ── Tagline ── */}
          <div className="space-y-1">
            <Label>شعار أو وصف العرض (اختياري)</Label>
            <Input
              placeholder="مثال: عرض نهاية الأسبوع — اطلب الآن!"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
            />
          </div>

          {/* ── Coupon Code ── */}
          <div className="space-y-1">
            <Label>كود الكوبون (اختياري)</Label>
            <Input
              placeholder="مثال: SAVE20"
              value={couponCode}
              onChange={e => setCouponCode(e.target.value)}
              className="font-mono tracking-widest"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">إذا أدخلت كوداً سيظهر على البوستر بدل السعر الجديد في خانة الكوبون</p>
          </div>

          <Button
            className="w-full text-base py-5"
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate}
          >
            {generateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⚙️</span>
                جاري التوليد... (قد يستغرق 15-30 ثانية)
              </span>
            ) : (
              "✨ توليد البوستر"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Result ── */}
      {generatedUrl && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              البوستر المولّد
              {generatedTemplateName && (
                <span className="mr-2 text-sm font-normal text-muted-foreground">— {generatedTemplateName}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <img
              src={generatedUrl}
              alt="generated promo"
              className="w-full rounded-xl border"
            />
            <a
              href={generatedUrl}
              download="promo-banner.png"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full">⬇️ تحميل البوستر</Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* ── History ── */}
      {history.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-muted-foreground">البوسترات السابقة</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {history.map(item => (
              <Card key={item.id} className="overflow-hidden">
                <img src={item.resultUrl} alt="promo" className="w-full aspect-square object-cover" />
                <CardContent className="py-2 px-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      <span className="line-through">{item.oldPrice}</span>
                      {" → "}
                      <span className="text-primary font-bold">{item.newPrice}</span>
                    </div>
                    <a href={item.resultUrl} download target="_blank" rel="noopener noreferrer">
                      <button className="text-xs text-primary underline">تحميل</button>
                    </a>
                  </div>
                  {item.tagline && <p className="text-xs text-muted-foreground truncate mt-0.5">{item.tagline}</p>}
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground/60">{getTemplateName(item.templateId)}</p>
                    <p className="text-xs text-muted-foreground/60">{new Date(item.createdAt).toLocaleDateString("ar-SA")}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: PromoTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const previewSrc = template.previewUrl;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col rounded-xl border-2 overflow-hidden text-right transition-all hover:border-primary/60",
        selected
          ? "border-primary shadow-md ring-2 ring-primary/20"
          : "border-border bg-background hover:bg-accent/20",
      )}
    >
      {selected && (
        <span className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white shadow">✓</span>
      )}

      {/* Preview thumbnail */}
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {!imgError ? (
          <img
            src={previewSrc}
            alt={template.nameAr}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <span className="text-3xl">{template.emoji}</span>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="px-2 py-1.5 bg-background">
        <p className="text-xs font-semibold leading-tight truncate">{template.nameAr}</p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{template.description}</p>
      </div>
    </button>
  );
}
