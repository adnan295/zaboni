/**
 * Template D — Minimal Card
 * Light background • Vertical accent stripe (left) • Circular food image (top-right)
 * Large Arabic tagline (right-anchored) • Coupon pill at bottom
 */
import sharp from "sharp";
import { BannerInput, LayoutPalette, ensureFonts, xe, hexToRgb, parsePrice, splitTagline, fontFaceBlock, makeCircularBuffer, bufferToBase64Png } from "../bannerShared";

export const PALETTE_D: Record<string, LayoutPalette> = {
  "d-white-pink": {
    bgColor: "#FFF5F9", accentColor: "#E91E8C",
    textColor: "#1A1A1A", subTextColor: "#555555",
    couponBg: "#E91E8C", couponText: "#FFFFFF",
    circleBorder: "#FFB3D9",
  },
  "d-white-blue": {
    bgColor: "#F0F6FF", accentColor: "#1565C0",
    textColor: "#1A1A1A", subTextColor: "#444444",
    couponBg: "#1565C0", couponText: "#FFFFFF",
    circleBorder: "#90CAF9",
  },
  "d-cream-green": {
    bgColor: "#F2FBF6", accentColor: "#00A86B",
    textColor: "#1A1A1A", subTextColor: "#444444",
    couponBg: "#00A86B", couponText: "#FFFFFF",
    circleBorder: "#A5D6A7",
  },
};

export async function composeBannerD(palette: LayoutPalette, input: BannerInput): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;
  const p = palette;

  const oldP = parsePrice(input.oldPrice);
  const newP = parsePrice(input.newPrice);
  const currency = newP.unit || oldP.unit || "ل.س";
  const lines = splitTagline(input.tagline, 2);

  const STRIPE_W = 22;
  const CIRCLE_D = 420;
  const CIRCLE_CX = S - 80 - CIRCLE_D / 2;
  const CIRCLE_CY = 90 + CIRCLE_D / 2;

  const COUPON_H = 110;
  const COUPON_Y = S - COUPON_H - 60;
  const COUPON_X = 54;
  const COUPON_W = S - 108;
  const COUPON_R = 28;

  const TEXT_RX = S - 80;
  const TEXT_START_Y = CIRCLE_CY + CIRCLE_D / 2 + 60;

  const appBase64 = await bufferToBase64Png(input.appLogoBuffer, 60);

  const couponContent = input.couponCode
    ? `الكود: ${input.couponCode}   •   ${newP.num} ${currency}`
    : `السعر الجديد: ${newP.num} ${currency}`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>${fontFaceBlock(fonts)}</style>
  <clipPath id="couponClip"><rect x="${COUPON_X}" y="${COUPON_Y}" width="${COUPON_W}" height="${COUPON_H}" rx="${COUPON_R}"/></clipPath>
</defs>

<!-- Background -->
<rect width="${S}" height="${S}" fill="${p.bgColor}"/>

<!-- Accent stripe left -->
<rect x="0" y="0" width="${STRIPE_W}" height="${S}" fill="${p.accentColor}"/>

<!-- Circle border for food image -->
<circle cx="${CIRCLE_CX}" cy="${CIRCLE_CY}" r="${CIRCLE_D / 2 + 10}" fill="${p.circleBorder}" opacity="0.5"/>
<circle cx="${CIRCLE_CX}" cy="${CIRCLE_CY}" r="${CIRCLE_D / 2 + 4}" fill="${p.bgColor}"/>

<!-- Old price (struck) -->
<text x="${TEXT_RX}" y="${TEXT_START_Y}"
  font-family="Tajawal" font-weight="700" font-size="38" fill="${p.subTextColor}"
  text-anchor="end" dominant-baseline="middle">${xe(oldP.num + " " + currency)}</text>
<line x1="${TEXT_RX - 240}" y1="${TEXT_START_Y}" x2="${TEXT_RX}" y2="${TEXT_START_Y}" stroke="${p.subTextColor}" stroke-width="2.5"/>

<!-- Tagline -->
<text x="${TEXT_RX}" y="${TEXT_START_Y + 74}"
  font-family="Tajawal" font-weight="800" font-size="${lines.length === 1 ? 74 : 62}" fill="${p.textColor}"
  text-anchor="end" dominant-baseline="middle">${xe(lines[0]!)}</text>
${lines[1] ? `<text x="${TEXT_RX}" y="${TEXT_START_Y + 74 + 82}"
  font-family="Tajawal" font-weight="700" font-size="58" fill="${p.textColor}"
  text-anchor="end" dominant-baseline="middle">${xe(lines[1])}</text>` : ""}

<!-- Restaurant name -->
<text x="${TEXT_RX}" y="${COUPON_Y - 36}"
  font-family="Tajawal" font-weight="400" font-size="32" fill="${p.subTextColor}"
  text-anchor="end" dominant-baseline="middle">${xe(input.restaurantName)}</text>

<!-- Coupon pill -->
<g clip-path="url(#couponClip)">
  <rect x="${COUPON_X}" y="${COUPON_Y}" width="${COUPON_W}" height="${COUPON_H}" fill="${p.couponBg}"/>
</g>
<text x="${COUPON_X + COUPON_W / 2}" y="${COUPON_Y + COUPON_H / 2 + 3}"
  font-family="Tajawal" font-weight="700" font-size="38" fill="${p.couponText}"
  text-anchor="middle" dominant-baseline="middle">${xe(couponContent)}</text>

<!-- App logo bottom-left (inside stripe area + a bit) -->
<image href="data:image/png;base64,${appBase64}" x="6" y="${S - 90}" width="60" height="60" opacity="0.85"/>
</svg>`;

  const { r, g, b } = hexToRgb(p.bgColor!);
  let base = await sharp({ create: { width: S, height: S, channels: 3, background: { r, g, b } } }).png().toBuffer();

  // Circular food image top-right
  if (input.foodImageBuffer) {
    const circle = await makeCircularBuffer(input.foodImageBuffer, CIRCLE_D);
    const left = Math.round(CIRCLE_CX - CIRCLE_D / 2);
    const top = Math.round(CIRCLE_CY - CIRCLE_D / 2);
    base = await sharp(base).composite([{ input: circle, left, top }]).png().toBuffer();
  }

  return sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
