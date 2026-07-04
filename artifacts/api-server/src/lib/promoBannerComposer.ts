/**
 * Central banner registry — exactly 4 layout templates (A/B/C/D).
 * Each template maps to one compositor + one fixed colour palette.
 */
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import sharp from "sharp";

import { BannerInput, LayoutPalette, ASSETS_DIR, ensureAppLogo } from "./bannerShared";
import { composeBannerA, PALETTE_A } from "./templates/bannerA";
import { composeBannerB, PALETTE_B } from "./templates/bannerB";
import { composeBannerC, PALETTE_C } from "./templates/bannerC";
import { composeBannerD, PALETTE_D } from "./templates/bannerD";

export type { BannerInput };
export { ASSETS_DIR };

type Layout = "A" | "B" | "C" | "D";

interface TemplateSpec {
  id: string;
  nameAr: string;
  description: string;
  emoji: string;
  layout: Layout;
  palette: LayoutPalette;
}

export interface PublicTemplate {
  id: string;
  nameAr: string;
  description: string;
  emoji: string;
  layoutGroup: Layout;
  previewUrl: string;
}

const TEMPLATES: TemplateSpec[] = [
  {
    id: "template-a",
    nameAr: "كلاسيك وردي",
    description: "نص يسار — صورة يمين — وردي فيوشيا",
    emoji: "🩷",
    layout: "A",
    palette: PALETTE_A["a-pink"]!,
  },
  {
    id: "template-b",
    nameAr: "هيدر مع الشعار",
    description: "هيدر أبيض بشعاريك — عنوان كبير — كوبون تذكرة",
    emoji: "🎟️",
    layout: "B",
    palette: PALETTE_B,
  },
  {
    id: "template-c",
    nameAr: "تغطية كاملة",
    description: "الطعام يملأ الصورة — شارة خصم دائرية — شريط معلومات",
    emoji: "🔥",
    layout: "C",
    palette: PALETTE_C,
  },
  {
    id: "template-d",
    nameAr: "بطاقة بيضاء",
    description: "خلفية فاتحة — صورة دائرية أنيقة — نص كبير",
    emoji: "🃏",
    layout: "D",
    palette: PALETTE_D["d-white-pink"]!,
  },
];

function previewUrl(id: string) {
  return `/api/restaurant-portal/promo-templates/preview/${id}.png`;
}

export function listPublicTemplates(): PublicTemplate[] {
  return TEMPLATES.map(t => ({
    id: t.id,
    nameAr: t.nameAr,
    description: t.description,
    emoji: t.emoji,
    layoutGroup: t.layout,
    previewUrl: previewUrl(t.id),
  }));
}

export async function composeBannerByTemplate(
  templateId: string,
  input: Omit<BannerInput, "appLogoBuffer">,
): Promise<Buffer> {
  const spec = TEMPLATES.find(t => t.id === templateId);
  if (!spec) throw new Error(`Unknown templateId: ${templateId}`);
  const appLogoBuffer = await ensureAppLogo();
  const full: BannerInput = { ...input, appLogoBuffer };
  switch (spec.layout) {
    case "A": return composeBannerA(spec.palette, full);
    case "B": return composeBannerB(spec.palette, full);
    case "C": return composeBannerC(spec.palette, full);
    case "D": return composeBannerD(spec.palette, full);
  }
}

// ── Preview generation ──────────────────────────────────────────────────────

const SAMPLE_INPUT: Omit<BannerInput, "appLogoBuffer"> = {
  restaurantName: "مطعمك",
  oldPrice: "25,000",
  newPrice: "17,500",
  tagline: "عرض خاص لفترة محدودة",
  couponCode: "SAVE30",
};

async function buildPreviewPng(templateId: string): Promise<Buffer> {
  const full = await composeBannerByTemplate(templateId, SAMPLE_INPUT);
  return sharp(full).resize(400, 400).png({ compressionLevel: 8 }).toBuffer();
}

let _previewsPromise: Promise<void> | null = null;
let _previewsReady = false;

export async function ensurePreviewsExist(): Promise<void> {
  if (_previewsReady) return;
  if (_previewsPromise) return _previewsPromise;
  _previewsPromise = (async () => {
    const dir = path.join(ASSETS_DIR, "previews");
    await mkdir(dir, { recursive: true });
    await Promise.all(
      TEMPLATES.map(async t => {
        const filePath = path.join(dir, `${t.id}.png`);
        if (!existsSync(filePath)) {
          const buf = await buildPreviewPng(t.id);
          await writeFile(filePath, buf);
        }
      }),
    );
    _previewsReady = true;
  })();
  return _previewsPromise;
}

/** Serve a pre-generated preview PNG for a given template id. */
export async function getPreviewBuffer(templateId: string): Promise<Buffer | null> {
  const spec = TEMPLATES.find(t => t.id === templateId);
  if (!spec) return null;
  await ensurePreviewsExist();
  const filePath = path.join(ASSETS_DIR, "previews", `${templateId}.png`);
  if (!existsSync(filePath)) return null;
  const { readFile } = await import("fs/promises");
  return readFile(filePath);
}

// ── Legacy backward-compat exports ─────────────────────────────────────────
export { PALETTE_A as BANNER_CONFIGS };
export async function composeBanner(
  config: LayoutPalette,
  restaurantName: string,
  oldPrice: string,
  newPrice: string,
  tagline: string,
  foodImageBuffer?: Buffer,
): Promise<Buffer> {
  const appLogoBuffer = await ensureAppLogo();
  return composeBannerA(config, { restaurantName, oldPrice, newPrice, tagline, foodImageBuffer, appLogoBuffer });
}
