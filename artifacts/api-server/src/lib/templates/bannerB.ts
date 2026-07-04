/**
 * Template B — Branded Header
 * White header band with app logo (left) + restaurant logo (right)
 * Bi-color background separated by a real SVG quadratic-Bezier wave arc
 * Centered Arabic campaign title
 * Ticket-style coupon with notched ends
 * Oval-cropped food image at bottom-center (wider than tall)
 */
import sharp from "sharp";
import {
  BannerInput, LayoutPalette,
  ensureFonts, xe, hexToRgb, parsePrice, splitTagline, fontFaceBlock,
  makeOvalBuffer, bufferToBase64Png,
} from "../bannerShared";

export const PALETTE_B: LayoutPalette = {
  topColor: "#E91E8C",
  bottomColor: "#FFC0E0",
  textColor: "#FFFFFF",
  subtitleColor: "#FFE8F5",
  ticketLeftBg: "#1A1A1A",
  ticketLeftText: "#FFFFFF",
  ticketRightBg: "#FFFFFF",
  ticketRightText: "#1A1A1A",
  headerBg: "#FFFFFF",
};

export async function composeBannerB(palette: LayoutPalette, input: BannerInput): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;
  const p = palette;
  const HEADER_H = 130;

  // Food: oval, wider than tall — sits at the bottom, slightly overflowing
  const OVAL_W = 600;
  const OVAL_H = 460;
  const OVAL_LEFT = Math.round((S - OVAL_W) / 2);
  const OVAL_TOP = S - OVAL_H + 40; // 40px below canvas — cropped at bottom edge

  const oldP = parsePrice(input.oldPrice);
  const newP = parsePrice(input.newPrice);
  const currency = newP.unit || oldP.unit || "ل.س";
  const lines = splitTagline(input.tagline, 2);

  // Title Y: in the top half of the content area (between header and ticket)
  const CONTENT_MID = HEADER_H + Math.round((OVAL_TOP - 140 - HEADER_H) / 2);
  const titleY = CONTENT_MID - (lines.length > 1 ? 50 : 0);

  // Ticket
  const tW = 820, tH = 110;
  const tX = (S - tW) / 2;
  const tY = titleY + (lines.length === 1 ? 110 : 200);
  const tHalf = tW / 2;
  const tR = 24;

  const appBase64 = await bufferToBase64Png(input.appLogoBuffer, 90);
  let restBase64 = "";
  if (input.restaurantLogoBuffer) {
    restBase64 = await bufferToBase64Png(input.restaurantLogoBuffer, 90);
  }

  const couponText = input.couponCode ? `كود: ${input.couponCode}` : (newP.num + " " + currency);

  // SVG wave arc that separates top (topColor) from bottom (bottomColor)
  // Quadratic Bezier: starts at (0, waveY), control point at (S/2, waveY+80), ends at (S, waveY)
  const waveY = 680;
  const { r: r2, g: g2, b: b2 } = hexToRgb(p.bottomColor!);

  const waveSvg = Buffer.from(`<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 ${waveY} Q${S / 2} ${waveY + 90} ${S} ${waveY} L${S} ${S} L0 ${S} Z"
      fill="rgb(${r2},${g2},${b2})"/>
  </svg>`);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs>
  <style>${fontFaceBlock(fonts)}</style>
  <clipPath id="appClip"><circle cx="75" cy="${HEADER_H / 2}" r="44"/></clipPath>
  <clipPath id="restClip"><circle cx="${S - 75}" cy="${HEADER_H / 2}" r="44"/></clipPath>
  <clipPath id="ticketClip"><rect x="${tX}" y="${tY}" width="${tW}" height="${tH}" rx="${tR}"/></clipPath>
</defs>

<!-- White header -->
<rect width="${S}" height="${HEADER_H}" fill="${p.headerBg}"/>
<line x1="0" y1="${HEADER_H}" x2="${S}" y2="${HEADER_H}" stroke="#E0E0E0" stroke-width="1.5"/>

<!-- App logo left -->
<image href="data:image/png;base64,${appBase64}" x="31" y="${(HEADER_H - 90) / 2}" width="90" height="90" clip-path="url(#appClip)"/>

<!-- Restaurant logo or initials right -->
${restBase64
    ? `<image href="data:image/png;base64,${restBase64}" x="${S - 121}" y="${(HEADER_H - 90) / 2}" width="90" height="90" clip-path="url(#restClip)"/>`
    : `<circle cx="${S - 75}" cy="${HEADER_H / 2}" r="40" fill="#F0F0F0"/>
       <text x="${S - 75}" y="${HEADER_H / 2 + 6}" text-anchor="middle" dominant-baseline="middle" font-size="24" fill="#999">${xe(input.restaurantName.slice(0, 2))}</text>`}

<!-- Center header: restaurant name -->
<text x="${S / 2}" y="${HEADER_H / 2 + 6}" font-family="Tajawal" font-size="22" font-weight="400" fill="#AAAAAA"
  text-anchor="middle" dominant-baseline="middle">${xe(input.restaurantName)}</text>

<!-- Campaign title -->
<text x="${S / 2}" y="${titleY}" font-family="Tajawal" font-weight="800"
  font-size="${lines.length === 1 ? 90 : 70}" fill="${p.textColor}"
  text-anchor="middle" dominant-baseline="middle">${xe(lines[0]!)}</text>
${lines[1] ? `<text x="${S / 2}" y="${titleY + 94}" font-family="Tajawal" font-weight="700" font-size="64"
  fill="${p.subtitleColor}" text-anchor="middle" dominant-baseline="middle">${xe(lines[1])}</text>` : ""}

<!-- Ticket coupon -->
<g clip-path="url(#ticketClip)">
  <rect x="${tX}" y="${tY}" width="${tW}" height="${tH}" fill="${p.ticketRightBg}"/>
  <rect x="${tX}" y="${tY}" width="${tHalf}" height="${tH}" fill="${p.ticketLeftBg}"/>
</g>
<!-- Notch circles at left and right edges -->
<circle cx="${tX}" cy="${tY + tH / 2}" r="20" fill="${p.topColor}"/>
<circle cx="${tX + tW}" cy="${tY + tH / 2}" r="20" fill="${p.topColor}"/>
<!-- Dashed separator -->
<line x1="${tX + tHalf}" y1="${tY + 14}" x2="${tX + tHalf}" y2="${tY + tH - 14}"
  stroke="#88888866" stroke-width="2" stroke-dasharray="8,6"/>

<!-- Left half: old price (struck through) + currency -->
<text x="${tX + tHalf / 2}" y="${tY + tH / 2 - 14}" font-family="Tajawal" font-weight="700" font-size="28"
  fill="${p.ticketLeftText}" text-anchor="middle" dominant-baseline="middle">${xe(oldP.num)}</text>
<line x1="${tX + 28}" y1="${tY + tH / 2 - 14}" x2="${tX + tHalf - 28}" y2="${tY + tH / 2 - 14}"
  stroke="${p.ticketLeftText}" stroke-width="2.5"/>
<text x="${tX + tHalf / 2}" y="${tY + tH / 2 + 20}" font-family="Tajawal" font-weight="400" font-size="20"
  fill="${p.ticketLeftText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

<!-- Right half: new price or coupon code -->
<text x="${tX + tHalf + tHalf / 2}" y="${tY + tH / 2 + 3}" font-family="Tajawal" font-weight="800"
  font-size="${input.couponCode ? 36 : 48}" fill="${p.ticketRightText}"
  text-anchor="middle" dominant-baseline="middle">${xe(couponText)}</text>
${!input.couponCode ? `<text x="${tX + tHalf + tHalf / 2}" y="${tY + tH - 10}" font-family="Tajawal" font-size="18"
  fill="${p.ticketRightText}" text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>` : ""}

</svg>`;

  // Build layers: background → wave overlay → oval food image → SVG text/UI overlay
  const { r, g, b } = hexToRgb(p.topColor!);
  let base = await sharp({ create: { width: S, height: S, channels: 3, background: { r, g, b } } }).png().toBuffer();

  // Composite wave arc
  base = await sharp(base).composite([{ input: waveSvg }]).png().toBuffer();

  // Oval food image at bottom-center
  if (input.foodImageBuffer) {
    const oval = await makeOvalBuffer(input.foodImageBuffer, OVAL_W, OVAL_H);
    base = await sharp(base).composite([{ input: oval, left: OVAL_LEFT, top: OVAL_TOP }]).png().toBuffer();
  }

  // SVG overlay (header, title, ticket)
  return sharp(base).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}
