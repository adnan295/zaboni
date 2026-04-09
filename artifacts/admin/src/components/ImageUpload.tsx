import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminToken } from "@/lib/api";

const API_BASE = "/api";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export function ImageUpload({ value, onChange, label = "الصورة" }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("نوع الملف غير مدعوم. يُسمح فقط بـ JPG وPNG وWebP");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      setUploadError("حجم الملف يتجاوز الحد المسموح (5 ميغابايت)");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const token = getAdminToken();
      const urlRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "فشل الحصول على رابط الرفع");
      }

      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error("فشل رفع الصورة إلى التخزين");
      }

      onChange(`${API_BASE}/storage/public-objects/${objectPath}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "حدث خطأ أثناء الرفع");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => {
            setUploadError(null);
            onChange(e.target.value);
          }}
          placeholder="https://... أو ارفع صورة"
          className="flex-1 text-sm"
          dir="ltr"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="shrink-0 text-xs"
        >
          {isUploading ? "جاري الرفع..." : "رفع صورة"}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}
      {value && (
        <div className="relative w-full h-32 rounded-md overflow-hidden border bg-muted">
          <img
            src={value}
            alt="معاينة الصورة"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
