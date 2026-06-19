/**
 * Template B — Branded Header
 * White header with app + restaurant logos
 * Bi-color background with SVG wave divider
 * Centered campaign title + ticket coupon
 * Circular food image at bottom-center
 */
import sharp from "sharp";
import { BannerInput, LayoutPalette, ensureFonts, xe, hexToRgb, parsePrice, splitTagline, fontFaceBlock, makeCircularBuffer, bufferToBase64Png } from "../bannerShared";

export const PALETTE_B: Record<string, LayoutPalette> = {
  "b-pink": {
    topColor: "#E91E8C", bottomColor: "#FF80C8",
    textColor: "#FFFFFF", subtitleColor: "#FFE0F0",
    ticketLeftBg: "#1A1A1A", ticketLeftText: "#FFFFFF",
    ticketRightBg: "#FFFFFF", ticketRightText: "#1A1A1A",
    headerBg: "#FFFFFF",
  },
  "b-blue": {
    topColor: "#1565C0", bottomColor: "#42A5F5",
    textColor: "#FFFFFF", subtitleColor: "#BBDEFB",
    ticketLeftBg: "#0D47A1", ticketLeftText: "#FFFFFF",
    ticketRightBg: "#FFFFFF", ticketRightText: "#0D47A1",
    headerBg: "#FFFFFF",
  },
  "b-orange": {
    topColor: "#E65100", bottomColor: "#FF9800",
    textColor: "#FFFFFF", subtitleColor: "#FFE0B2",
    ticketLeftBg: "#BF360C", ticketLeftText: "#FFFFFF",
    ticketRightBg: "#FFFFFF", ticketRightText: "#BF360C",
    headerBg: "#FFFFFF",
  },
};

export async function composeBannerB(palette: LayoutPalette, input: BannerInput): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;
  const p = palette;
  const HEADER_H = 130;
  const FOOD_D = 540; // diameter of circular food image
  const FOOD_Y = S - FOOD_D + 60; // top of food circle placement (overlaps bottom)

  const oldP = parsePrice(input.oldPrice);
  const newP = parsePrice(input.newPrice);
  const currency = newP.unit || oldP.unit || "ل.س";
  const lines = splitTagline(input.tagline, 2);
  const titleY = HEADER_H + Math.round((S - HEADER_H - FOOD_D / 2 - 260) / 2) + 80;

  const appBase64 = await bufferToBase64Png(input.appLogoBuffer, 88);
  let restBase64 = "";
  if (input.restaurantLogoBuffer) {
    restBase64 = await bufferToBase64Png(input.restaurantLogoBuffer, 88);
  }

  // Ticket dimensions
  const tW = 800, tH = 110, tX = (S - tW) / 2, tY = titleY + (lines.length === 1 ? 110 : 190);
  const tHalf = tW / 2;
  const tR = 20;

  const couponText = input.couponCode ? `الكود: ${input.couponCode}` : (newP.num + " " + currency);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>${fontFaceBlock(fonts)}</style>
  <clipPath id="appLogoClip"><circle cx="75" cy="${HEADER_H / 2}" r="44"/></clipPath>
  <clipPath id="restLogoClip"><circle cx="${S - 75}" cy="${HEADER_H / 2}" r="44"/></clipPath>
  <clipPath id="ticketClip"><rect x="${tX}" y="${tY}" width="${tW}" height="${tH}" rx="${tR}"/></clipPath>
</defs>

<!-- White header -->
<rect width="${S}" height="${HEADER_H}" fill="${p.headerBg}"/>
<line x1="0" y1="${HEADER_H}" x2="${S}" y2="${HEADER_H}" stroke="#E0E0E0" stroke-width="1.5"/>

<!-- App logo left -->
<image href="data:image/png;base64,${appBase64}" x="31" y="${(HEADER_H - 88) / 2}" width="88" height="88" clip-path="url(#appLogoClip)"/>

<!-- Restaurant logo right -->
${restBase64 ? `<image href="data:image/png;base64,${restBase64}" x="${S - 119}" y="${(HEADER_H - 88) / 2}" width="88" height="88" clip-path="url(#restLogoClip)"/>` : `<circle cx="${S - 75}" cy="${HEADER_H / 2}" r="40" fill="#F0F0F0"/><text x="${S - 75}" y="${HEADER_H / 2 + 4}" text-anchor="middle" dominant-baseline="middle" font-size="22" fill="#999">${xe(input.restaurantName.slice(0, 2))}</text>`}

<!-- Center separator text -->
<text x="${S / 2}" y="${HEADER_H / 2 + 6}" font-family="Tajawal" font-size="22" font-weight="400" fill="#AAAAAA" text-anchor="middle" dominant-baseline="middle">${xe(input.restaurantName)}</text>

<!-- Title lines -->
<text x="${S / 2}" y="${titleY}" font-family="Tajawal" font-weight="800" font-size="${lines.length === 1 ? 88 : 68}" fill="${p.textColor}"
  text-anchor="middle" dominant-baseline="middle">${xe(lines[0]!)}</text>
${lines[1] ? `<text x="${S / 2}" y="${titleY + 90}" font-family="Tajawal" font-weight="700" font-size="62" fill="${p.subtitleColor}"
  text-anchor="middle" dominant-baseline="middle">${xe(lines[1])}</text>` : ""}

<!-- Ticket / Coupon -->
<g clip-path="url(#ticketClip)">
  <rect x="${tX}" y="${tY}" width="${tW}" height="${tH}" fill="${p.ticketRightBg}"/>
  <rect x="${tX}" y="${tY}" width="${tHalf}" height="${tH}" fill="${p.ticketLeftBg}"/>
</g>
<!-- Ticket notch left -->
<circle cx="${tX}" cy="${tY + tH / 2}" r="18" fill="${p.topColor}"/>
<!-- Ticket notch right -->
<circle cx="${tX + tW}" cy="${tY + tH / 2}" r="18" fill="${p.topColor}"/>
<!-- Dashed separator -->
<line x1="${tX + tHalf}" y1="${tY + 12}" x2="${tX + tHalf}" y2="${tY + tH - 12}" stroke="#88888866" stroke-width="2" stroke-dasharray="8,6"/>

<!-- Left half: old price struck + discount -->
<text x="${tX + tHalf / 2}" y="${tY + tH / 2 - 14}" font-family="Tajawal" font-weight="700" font-size="26" fill="${p.ticketLeftText}" text-anchor="middle" dominant-baseline="middle">${xe(oldP.num)}</text>
<line x1="${tX + 24}" y1="${tY + tH / 2 - 14}" x2="${tX + tHalf - 24}" y2="${tY + tH / 2 - 14}" stroke="${p.ticketLeftText}" stroke-width="2.5"/>
<text x="${tX + tHalf / 2}" y="${tY + tH / 2 + 20}" font-family="Tajawal" font-weight="400" font-size="20" fill="${p.ticketLeftText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

<!-- Right half: coupon code or new price -->
<text x="${tX + tHalf + tHalf / 2}" y="${tY + tH / 2 - 10}" font-family="Tajawal" font-weight="800" font-size="${input.couponCode ? 38 : 46}" fill="${p.ticketRightText}" text-anchor="middle" dominant-baseline="middle">${xe(couponText)}</text>
${!input.couponCode ? `<text x="${tX + tHalf + tHalf / 2}" y="${tY + tH / 2 + 30}" font-family="Tajawal" font-size="20" fill="${p.ticketRightText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>` : ""}

</svg>`;

  // Build layered composite
  const { r, g, b } = hexToRgb(p.topColor!);
  let base = await sharp({ create: { width: S, height: S, channels: 3, background: { r, g, b } } }).png().toBuffer();

  // Bottom gradient wave overlay SVG (just a color band, not actual wave — simpler for sharp)
  const { r: r2, g: g2, b: b2 } = hexToRgb(p.bottomColor!);
  const waveSvg = Buffer.from(`<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wave" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgb(${r2},${g2},${b2})" stop-opacity="0"/>
        <stop offset="60%" stop-color="rgb(${r2},${g2},${b2})" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="rgb(${r2},${g2},${b2})" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#wave)"/>
  </svg>`);
  base = await sharp(base).composite([{ input: waveSvg }]).png().toBuffer();

  // Circular food image at bottom-center
  if (input.foodImageBuffer) {
    const circle = await makeCircularBuffer(input.foodImageBuffer, FOOD_D);
    const foodLeft = Math.round((S - FOOD_D) / 2);
    base = await sharp(base).composite([{ input: circle, left: foodLeft, top: FOOD_Y }]).png().toBuffer();
  }

  // SVG text + header overlay
  return sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
