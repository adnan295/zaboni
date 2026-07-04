/**
 * Template A — Split Classic
 * Left: solid-color panel with restaurant name pill + tagline + coupon
 * Right: food image with horizontal gradient fade
 */
import sharp from "sharp";
import { BannerInput, LayoutPalette, ensureFonts, xe, hexToRgb, parsePrice, splitTagline, fontFaceBlock, bufferToBase64Png } from "../bannerShared";

export const PALETTE_A: Record<string, LayoutPalette> = {
  "a-pink": {
    bgColor: "#E91E8C", textColor: "#FFFFFF",
    couponLeftBg: "#A8E6CF", couponRightBg: "#FFFFFF",
    couponLeftText: "#1A1A1A", couponRightText: "#1A1A1A",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
  "a-dark": {
    bgColor: "#1A1A1A", textColor: "#FFFFFF",
    couponLeftBg: "#C9A84C", couponRightBg: "#FFFFFF",
    couponLeftText: "#FFFFFF", couponRightText: "#1A1A1A",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
  "a-green": {
    bgColor: "#00A86B", textColor: "#FFFFFF",
    couponLeftBg: "#C8F5E0", couponRightBg: "#FFFFFF",
    couponLeftText: "#1A1A1A", couponRightText: "#00A86B",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
};

export async function composeBannerA(palette: LayoutPalette, input: BannerInput): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;
  const p = palette;

  const oldP = parsePrice(input.oldPrice);
  const newP = parsePrice(input.newPrice);
  const currency = newP.unit || oldP.unit || "ل.س";
  const lines = splitTagline(input.tagline, 2);

  const cX = 54, cY = 770, cW = 490, cH = 124, cR = 22;
  const half2 = cW / 2;
  const fs1 = lines.length === 1 ? 80 : 58;
  const tagY = lines.length === 1 ? 480 : 400;
  const textRX = 510;

  let logoBase64 = "";
  if (input.restaurantLogoBuffer) {
    logoBase64 = await bufferToBase64Png(input.restaurantLogoBuffer, 56);
  }
  const appLogoBase64 = (await bufferToBase64Png(input.appLogoBuffer, 40)).valueOf();

  const svgOverlay = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>${fontFaceBlock(fonts)}</style>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${p.bgColor}" stop-opacity="1"/>
    <stop offset="50%"  stop-color="${p.bgColor}" stop-opacity="1"/>
    <stop offset="78%"  stop-color="${p.bgColor}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${p.bgColor}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="couponClip"><rect x="${cX}" y="${cY}" width="${cW}" height="${cH}" rx="${cR}"/></clipPath>
  <clipPath id="pillLogoClip"><circle cx="47" cy="87" r="28"/></clipPath>
</defs>

<rect width="${S}" height="${S}" fill="url(#fade)"/>

<!-- Restaurant pill -->
<rect x="54" y="54" width="${logoBase64 ? 290 : 240}" height="66" rx="33" fill="${p.pillBg}"/>
${logoBase64 ? `<image href="data:image/png;base64,${logoBase64}" x="19" y="59" width="56" height="56" clip-path="url(#pillLogoClip)"/>` : ""}
<text x="${logoBase64 ? 180 : 174}" y="87" font-family="Tajawal" font-weight="700" font-size="28" fill="${p.pillText}"
  text-anchor="middle" dominant-baseline="middle">${xe(input.restaurantName)}</text>

<!-- Tagline -->
<text x="${textRX}" y="${tagY}" font-family="Tajawal" font-weight="${lines.length === 1 ? 800 : 700}" font-size="${fs1}" fill="${p.textColor}"
  text-anchor="end" dominant-baseline="middle">${xe(lines[0]!)}</text>
${lines[1] ? `<text x="${textRX}" y="${tagY + 92}" font-family="Tajawal" font-weight="800" font-size="58" fill="${p.textColor}"
  text-anchor="end" dominant-baseline="middle">${xe(lines[1])}</text>` : ""}

<!-- Coupon -->
<g clip-path="url(#couponClip)">
  <rect x="${cX}" y="${cY}" width="${cW}" height="${cH}" fill="${p.couponRightBg}"/>
  <rect x="${cX}" y="${cY}" width="${half2}" height="${cH}" fill="${p.couponLeftBg}"/>
</g>
<line x1="${cX + half2}" y1="${cY + 14}" x2="${cX + half2}" y2="${cY + cH - 14}" stroke="#BBBBBB88" stroke-width="2.5" stroke-dasharray="8,5"/>

<text x="${cX + half2 / 2}" y="${cY + 36}" font-family="Tajawal" font-weight="700" font-size="30" fill="${p.couponLeftText}" text-anchor="middle" dominant-baseline="middle">${xe(oldP.num)}</text>
<line x1="${cX + 20}" y1="${cY + 36}" x2="${cX + half2 - 20}" y2="${cY + 36}" stroke="${p.couponLeftText}" stroke-width="2.5"/>
<text x="${cX + half2 / 2}" y="${cY + 78}" font-family="Tajawal" font-weight="400" font-size="22" fill="${p.couponLeftText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

<text x="${cX + half2 + half2 / 2}" y="${cY + 28}" font-family="Tajawal" font-weight="400" font-size="20" fill="${p.couponRightText}" text-anchor="middle" dominant-baseline="middle">السعر الجديد</text>
<text x="${cX + half2 + half2 / 2}" y="${cY + 68}" font-family="Tajawal" font-weight="800" font-size="42" fill="${p.couponRightText}" text-anchor="middle" dominant-baseline="middle">${xe(newP.num)}</text>
<text x="${cX + half2 + half2 / 2}" y="${cY + 102}" font-family="Tajawal" font-weight="400" font-size="18" fill="${p.couponRightText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

<!-- App logo bottom-left -->
<image href="data:image/png;base64,${appLogoBase64}" x="54" y="975" width="40" height="40" opacity="0.7"/>
</svg>`;

  const { r, g, b } = hexToRgb(p.bgColor!);
  let base = await sharp({ create: { width: S, height: S, channels: 3, background: { r, g, b } } }).png().toBuffer();

  if (input.foodImageBuffer) {
    const resized = await sharp(input.foodImageBuffer).resize(S, S, { fit: "cover" }).png().toBuffer();
    const cropLeft = Math.round(S * 0.55);
    const cropW = S - cropLeft;
    const cropped = await sharp(resized).extract({ left: cropLeft, top: 0, width: cropW, height: S }).png().toBuffer();
    base = await sharp(base).composite([{ input: cropped, left: S - cropW, top: 0 }]).png().toBuffer();
  }

  return sharp(base).composite([{ input: Buffer.from(svgOverlay) }]).png().toBuffer();
}
