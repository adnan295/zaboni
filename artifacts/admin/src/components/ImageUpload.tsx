import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = "/api";

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

    if (!file.type.startsWith("image/")) {
      setUploadError("الرجاء اختيار ملف صورة صالح");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const urlRes = await fetch(`${API_BASE}/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!urlRes.ok) {
        throw new Error("فشل الحصول على رابط الرفع");
      }

      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error("فشل رفع الصورة");
      }

      onChange(`${API_BASE}${objectPath}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "حدث خطأ أثناء الرفع");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const previewSrc = value || null;

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
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}
      {previewSrc && (
        <div className="relative w-full h-32 rounded-md overflow-hidden border bg-muted">
          <img
            src={previewSrc}
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
