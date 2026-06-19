/**
 * Template C — Full Bleed Dark
 * Food image fills entire canvas → dark vignette + gradient overlay
 * Centered circular badge showing discount percentage "خصم X%"
 * Bottom info strip: restaurant name + coupon code (if provided)
 */
import sharp from "sharp";
import {
  BannerInput, LayoutPalette,
  ensureFonts, xe, parsePrice, calcDiscountPct, fontFaceBlock, bufferToBase64Png,
} from "../bannerShared";

export const PALETTE_C: LayoutPalette = {
  badgeBg: "#E91E8C",
  badgeText: "#FFFFFF",
  badgeRing: "#FFFFFF",
  stripBg: "#000000",
  stripText: "#FFFFFF",
  accentColor: "#E91E8C",
};

export async function composeBannerC(palette: LayoutPalette, input: BannerInput): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;
  const p = palette;

  const oldP = parsePrice(input.oldPrice);
  const newP = parsePrice(input.newPrice);
  const currency = newP.unit || oldP.unit || "ل.س";
  const discountPct = calcDiscountPct(input.oldPrice, input.newPrice);

  const BADGE_R = 200;
  const BADGE_CX = S / 2;
  const BADGE_CY = 430;
  const STRIP_H = 150;

  const appBase64 = await bufferToBase64Png(input.appLogoBuffer, 70);
  let restBase64 = "";
  if (input.restaurantLogoBuffer) {
    restBase64 = await bufferToBase64Png(input.restaurantLogoBuffer, 70);
  }

  const couponLine = input.couponCode
    ? `كود الكوبون: ${input.couponCode}`
    : `${newP.num} ${currency}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>${fontFaceBlock(fonts)}</style>
  <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="black" stop-opacity="0"/>
    <stop offset="100%" stop-color="black" stop-opacity="0.75"/>
  </radialGradient>
  <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="black" stop-opacity="0.6"/>
    <stop offset="32%" stop-color="black" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="black" stop-opacity="0"/>
    <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
  </linearGradient>
</defs>

<!-- Dark overlays -->
<rect width="${S}" height="${S}" fill="url(#vignette)"/>
<rect width="${S}" height="${S}" fill="url(#topFade)"/>
<rect y="${S - 400}" width="${S}" height="400" fill="url(#bottomFade)"/>

<!-- App logo top-left -->
<image href="data:image/png;base64,${appBase64}" x="36" y="36" width="70" height="70" opacity="0.92"/>

<!-- Restaurant logo top-right -->
${restBase64 ? `<image href="data:image/png;base64,${restBase64}" x="${S - 106}" y="36" width="70" height="70" opacity="0.92"/>` : ""}

<!-- Tagline above badge -->
<text x="${BADGE_CX}" y="${BADGE_CY - BADGE_R - 28}" font-family="Tajawal" font-weight="700" font-size="38"
  fill="white" text-anchor="middle" dominant-baseline="middle" opacity="0.95">${xe(input.tagline)}</text>

<!-- Badge outer ring -->
<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R + 12}" fill="none"
  stroke="${p.badgeRing}" stroke-width="4" opacity="0.55"/>

<!-- Badge fill -->
<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R}" fill="${p.badgeBg}" opacity="0.96"/>

<!-- Discount percentage (large, centered) -->
${discountPct > 0
    ? `<text x="${BADGE_CX}" y="${BADGE_CY - 36}" font-family="Tajawal" font-weight="800" font-size="44"
        fill="${p.badgeText}" text-anchor="middle" dominant-baseline="middle">خصم</text>
       <text x="${BADGE_CX}" y="${BADGE_CY + 44}" font-family="Tajawal" font-weight="800" font-size="104"
        fill="${p.badgeText}" text-anchor="middle" dominant-baseline="middle">${discountPct}%</text>`
    : `<!-- No discount computable — show new price instead -->
       <text x="${BADGE_CX}" y="${BADGE_CY - 20}" font-family="Tajawal" font-weight="700" font-size="36"
        fill="${p.badgeText}" text-anchor="middle" dominant-baseline="middle">السعر الجديد</text>
       <text x="${BADGE_CX}" y="${BADGE_CY + 58}" font-family="Tajawal" font-weight="800" font-size="86"
        fill="${p.badgeText}" text-anchor="middle" dominant-baseline="middle">${xe(newP.num)}</text>
       <text x="${BADGE_CX}" y="${BADGE_CY + 112}" font-family="Tajawal" font-size="28"
        fill="${p.badgeText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>`}

<!-- Bottom info strip -->
<rect x="0" y="${S - STRIP_H}" width="${S}" height="${STRIP_H}" fill="${p.stripBg}" opacity="0.88"/>
<line x1="0" y1="${S - STRIP_H}" x2="${S}" y2="${S - STRIP_H}" stroke="${p.accentColor}" stroke-width="3"/>

<!-- Restaurant name (right side) -->
<text x="${S - 40}" y="${S - STRIP_H / 2}" font-family="Tajawal" font-weight="700" font-size="36"
  fill="${p.stripText}" text-anchor="end" dominant-baseline="middle">${xe(input.restaurantName)}</text>

<!-- Coupon code or new price (left side, accent color) -->
<text x="40" y="${S - STRIP_H / 2}" font-family="Tajawal" font-weight="800" font-size="36"
  fill="${p.accentColor}" text-anchor="start" dominant-baseline="middle">${xe(couponLine)}</text>

</svg>`;

  // Full-canvas food image as background
  let base: Buffer;
  if (input.foodImageBuffer) {
    base = await sharp(input.foodImageBuffer)
      .resize(S, S, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } else {
    base = await sharp({ create: { width: S, height: S, channels: 3, background: { r: 28, g: 28, b: 28 } } }).png().toBuffer();
  }

  return sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
