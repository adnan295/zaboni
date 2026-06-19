import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromoImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function PromoImages() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [foodImageUrl, setFoodImageUrl] = useState("");
  const [foodPreview, setFoodPreview] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [tagline, setTagline] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState("");

  const { data: history = [] } = useQuery({
    queryKey: ["promo-images"],
    queryFn: api.getPromoImages,
    refetchInterval: 60_000,
  });

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
      const servedUrl = `/api/storage${objectPath}`;
      setFoodImageUrl(servedUrl);
      setFoodPreview(URL.createObjectURL(file));
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الرفع", description: String(err instanceof Error ? err.message : err) });
    } finally {
      setUploading(false);
    }
  }

  const generateMutation = useMutation({
    mutationFn: () => api.generatePromoImage({ foodImageUrl: foodImageUrl || undefined, oldPrice, newPrice, tagline }),
    onSuccess: (data) => {
      setGeneratedUrl(data.resultUrl);
      qc.invalidateQueries({ queryKey: ["promo-images"] });
      toast({ title: "تم توليد البوستر بنجاح!" });
    },
    onError: (e) => toast({ variant: "destructive", title: "خطأ في التوليد", description: String(e instanceof Error ? e.message : e) }),
  });

  const canGenerate = oldPrice.trim() && newPrice.trim() && !generateMutation.isPending && !uploading;

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>إنشاء بوستر ترويجي</CardTitle>
          <p className="text-sm text-muted-foreground">ارفع صورة الوجبة وأدخل تفاصيل العرض، وسيقوم الذكاء الاصطناعي بإنشاء بوستر احترافي</p>
        </CardHeader>
        <CardContent className="space-y-4">
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
                onClick={() => { setFoodPreview(""); setFoodImageUrl(""); }}
              >
                إزالة الصورة
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>السعر الأصلي *</Label>
              <Input
                placeholder="مثال: 25000 ل.س"
                value={oldPrice}
                onChange={e => setOldPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>السعر بعد الخصم *</Label>
              <Input
                placeholder="مثال: 18000 ل.س"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>شعار أو وصف العرض (اختياري)</Label>
            <Input
              placeholder="مثال: عرض نهاية الأسبوع — اطلب الآن!"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
            />
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

      {generatedUrl && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">البوستر المولّد</CardTitle>
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
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{new Date(item.createdAt).toLocaleDateString("ar-SA")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
