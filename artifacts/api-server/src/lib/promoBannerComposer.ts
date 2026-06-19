/**
 * Central banner registry.
 * Each entry maps a templateId → layout + palette → compositor function.
 */
import { BannerInput, LayoutPalette, ensureAppLogo } from "./bannerShared";
import { composeBannerA, PALETTE_A } from "./templates/bannerA";
import { composeBannerB, PALETTE_B } from "./templates/bannerB";
import { composeBannerC, PALETTE_C } from "./templates/bannerC";
import { composeBannerD, PALETTE_D } from "./templates/bannerD";

export type { BannerInput };

type Layout = "A" | "B" | "C" | "D";

interface TemplateSpec {
  id: string;
  nameAr: string;
  description: string;
  emoji: string;
  layout: Layout;
  palette: LayoutPalette;
}

const TEMPLATES: TemplateSpec[] = [
  // ── Layout A: Split Classic ──────────────────────────────────────────
  {
    id: "a-pink",
    nameAr: "كلاسيك وردي",
    description: "نص يسار · صورة يمين · وردي فيوشيا",
    emoji: "🩷",
    layout: "A",
    palette: PALETTE_A["a-pink"]!,
  },
  {
    id: "a-dark",
    nameAr: "كلاسيك أسود ذهبي",
    description: "نص يسار · صورة يمين · فاخر",
    emoji: "🖤",
    layout: "A",
    palette: PALETTE_A["a-dark"]!,
  },
  {
    id: "a-green",
    nameAr: "كلاسيك أخضر",
    description: "نص يسار · صورة يمين · أخضر",
    emoji: "🟢",
    layout: "A",
    palette: PALETTE_A["a-green"]!,
  },
  // ── Layout B: Branded Header ─────────────────────────────────────────
  {
    id: "b-pink",
    nameAr: "هيدر وردي",
    description: "شعار زبوني + شعارك · عنوان كبير · كوبون تذكرة",
    emoji: "🎟️",
    layout: "B",
    palette: PALETTE_B["b-pink"]!,
  },
  {
    id: "b-blue",
    nameAr: "هيدر أزرق",
    description: "شعار زبوني + شعارك · عنوان كبير · كوبون تذكرة",
    emoji: "💙",
    layout: "B",
    palette: PALETTE_B["b-blue"]!,
  },
  {
    id: "b-orange",
    nameAr: "هيدر برتقالي",
    description: "شعار زبوني + شعارك · عنوان كبير · كوبون تذكرة",
    emoji: "🧡",
    layout: "B",
    palette: PALETTE_B["b-orange"]!,
  },
  // ── Layout C: Full Bleed Dark ────────────────────────────────────────
  {
    id: "c-red",
    nameAr: "تغطية كاملة وردي",
    description: "الطعام يملأ الصورة · بادج خصم دائري وسط",
    emoji: "🔥",
    layout: "C",
    palette: PALETTE_C["c-red"]!,
  },
  {
    id: "c-gold",
    nameAr: "تغطية كاملة ذهبي",
    description: "الطعام يملأ الصورة · بادج خصم ذهبي",
    emoji: "✨",
    layout: "C",
    palette: PALETTE_C["c-gold"]!,
  },
  // ── Layout D: Minimal Card ───────────────────────────────────────────
  {
    id: "d-white-pink",
    nameAr: "بطاقة بيضاء وردي",
    description: "خلفية فاتحة · صورة دائرية · نص أنيق",
    emoji: "🃏",
    layout: "D",
    palette: PALETTE_D["d-white-pink"]!,
  },
  {
    id: "d-cream-green",
    nameAr: "بطاقة كريمي أخضر",
    description: "خلفية فاتحة · صورة دائرية · نص أنيق",
    emoji: "🌿",
    layout: "D",
    palette: PALETTE_D["d-cream-green"]!,
  },
];

/** Flat list for the API (no palette exposed). */
export type PublicTemplate = {
  id: string;
  nameAr: string;
  description: string;
  emoji: string;
  layoutGroup: string;
};

export function listPublicTemplates(): PublicTemplate[] {
  return TEMPLATES.map(t => ({
    id: t.id,
    nameAr: t.nameAr,
    description: t.description,
    emoji: t.emoji,
    layoutGroup: t.layout,
  }));
}

/** Compose a banner given a templateId + BannerInput (without appLogoBuffer — we load it here). */
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

/** Generate a small 400×400 sample preview for a given templateId (no food image). */
export async function generateTemplatePreview(templateId: string): Promise<Buffer> {
  const sampleInput: Omit<BannerInput, "appLogoBuffer"> = {
    restaurantName: "مطعمك",
    oldPrice: "25,000",
    newPrice: "17,500",
    tagline: "عرض خاص لفترة محدودة",
    couponCode: "PROMO30",
  };
  const full = await composeBannerByTemplate(templateId, sampleInput);
  // Downscale to 400×400 for preview thumbnail
  const sharp = (await import("sharp")).default;
  return sharp(full).resize(400, 400).jpeg({ quality: 82 }).toBuffer();
}

// ── Legacy exports (keep backward compat with old imports) ────────────
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
