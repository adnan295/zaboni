/**
 * Template C — Full Bleed Dark
 * Food image fills entire canvas → dark gradient overlay
 * Centered discount badge circle
 * Bottom info strip with restaurant name + coupon code
 */
import sharp from "sharp";
import { BannerInput, LayoutPalette, ensureFonts, xe, parsePrice, fontFaceBlock, bufferToBase64Png } from "../bannerShared";

export const PALETTE_C: Record<string, LayoutPalette> = {
  "c-red": {
    badgeBg: "#E91E8C", badgeText: "#FFFFFF",
    stripBg: "#000000DD", stripText: "#FFFFFF",
    accentColor: "#E91E8C",
  },
  "c-gold": {
    badgeBg: "#C9A84C", badgeText: "#1A1A1A",
    stripBg: "#1A1A1ADD", stripText: "#F5DEB3",
    accentColor: "#C9A84C",
  },
  "c-teal": {
    badgeBg: "#00897B", badgeText: "#FFFFFF",
    stripBg: "#004D40DD", stripText: "#FFFFFF",
    accentColor: "#4DB6AC",
  },
};

export async function composeBannerC(palette: LayoutPalette, input: BannerInput): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;
  const p = palette;

  const oldP = parsePrice(input.oldPrice);
  const newP = parsePrice(input.newPrice);
  const currency = newP.unit || oldP.unit || "ل.س";

  const BADGE_R = 210;
  const BADGE_CX = S / 2;
  const BADGE_CY = 420;
  const STRIP_H = 160;

  const appBase64 = await bufferToBase64Png(input.appLogoBuffer, 70);
  let restBase64 = "";
  if (input.restaurantLogoBuffer) {
    restBase64 = await bufferToBase64Png(input.restaurantLogoBuffer, 70);
  }

  const couponLine = input.couponCode
    ? `الكود: ${input.couponCode}`
    : `${newP.num} ${currency}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>${fontFaceBlock(fonts)}</style>
  <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="black" stop-opacity="0"/>
    <stop offset="100%" stop-color="black" stop-opacity="0.72"/>
  </radialGradient>
  <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="black" stop-opacity="0.55"/>
    <stop offset="35%" stop-color="black" stop-opacity="0"/>
  </linearGradient>
</defs>

<!-- Dark overlays -->
<rect width="${S}" height="${S}" fill="url(#vignette)"/>
<rect width="${S}" height="${S}" fill="url(#topFade)"/>

<!-- App logo top-left -->
<image href="data:image/png;base64,${appBase64}" x="36" y="36" width="70" height="70" opacity="0.9"/>

<!-- Restaurant logo top-right (if available) -->
${restBase64 ? `<image href="data:image/png;base64,${restBase64}" x="${S - 106}" y="36" width="70" height="70" opacity="0.9"/>` : ""}

<!-- Tagline above badge -->
<text x="${BADGE_CX}" y="${BADGE_CY - BADGE_R - 24}" font-family="Tajawal" font-weight="700" font-size="40" fill="white"
  text-anchor="middle" dominant-baseline="middle" opacity="0.95">${xe(input.tagline)}</text>

<!-- Badge ring -->
<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R + 10}" fill="none" stroke="${p.accentColor}" stroke-width="5" opacity="0.7"/>
<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R}" fill="${p.badgeBg}" opacity="0.95"/>

<!-- Badge: old price -->
<text x="${BADGE_CX}" y="${BADGE_CY - 54}" font-family="Tajawal" font-weight="700" font-size="34" fill="${p.badgeText}"
  text-anchor="middle" dominant-baseline="middle">${xe(oldP.num + " " + currency)}</text>
<line x1="${BADGE_CX - 110}" y1="${BADGE_CY - 54}" x2="${BADGE_CX + 110}" y2="${BADGE_CY - 54}" stroke="${p.badgeText}" stroke-width="2.5"/>

<!-- Badge: new price large -->
<text x="${BADGE_CX}" y="${BADGE_CY + 12}" font-family="Tajawal" font-weight="800" font-size="88" fill="${p.badgeText}"
  text-anchor="middle" dominant-baseline="middle">${xe(newP.num)}</text>

<!-- Badge: currency -->
<text x="${BADGE_CX}" y="${BADGE_CY + 88}" font-family="Tajawal" font-weight="400" font-size="30" fill="${p.badgeText}"
  text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

<!-- Bottom strip -->
<rect x="0" y="${S - STRIP_H}" width="${S}" height="${STRIP_H}" fill="${p.stripBg}"/>
<line x1="0" y1="${S - STRIP_H}" x2="${S}" y2="${S - STRIP_H}" stroke="${p.accentColor}" stroke-width="3"/>

<!-- Restaurant name (right) -->
<text x="${S - 40}" y="${S - STRIP_H / 2}" font-family="Tajawal" font-weight="700" font-size="38" fill="${p.stripText}"
  text-anchor="end" dominant-baseline="middle">${xe(input.restaurantName)}</text>

<!-- Coupon code (left) -->
<text x="40" y="${S - STRIP_H / 2}" font-family="Tajawal" font-weight="800" font-size="38" fill="${p.accentColor}"
  text-anchor="start" dominant-baseline="middle">${xe(couponLine)}</text>

</svg>`;

  // Base: full-canvas food image or solid dark
  let base: Buffer;
  if (input.foodImageBuffer) {
    base = await sharp(input.foodImageBuffer)
      .resize(S, S, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } else {
    base = await sharp({ create: { width: S, height: S, channels: 3, background: { r: 30, g: 30, b: 30 } } }).png().toBuffer();
  }

  return sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
