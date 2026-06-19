import sharp from "sharp";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "fonts");

let fontsB64: { bold: string; regular: string; extraBold: string } | null = null;

function ensureFonts() {
  if (fontsB64) return fontsB64;
  fontsB64 = {
    regular: readFileSync(path.join(FONTS_DIR, "Tajawal-Regular.ttf")).toString("base64"),
    bold: readFileSync(path.join(FONTS_DIR, "Tajawal-Bold.ttf")).toString("base64"),
    extraBold: readFileSync(path.join(FONTS_DIR, "Tajawal-ExtraBold.ttf")).toString("base64"),
  };
  return fontsB64;
}

export interface BannerConfig {
  bgColor: string;
  textColor: string;
  couponLeftBg: string;
  couponRightBg: string;
  couponLeftText: string;
  couponRightText: string;
  pillBg: string;
  pillText: string;
}

export const BANNER_CONFIGS: Record<string, BannerConfig> = {
  "classic-red": {
    bgColor: "#E91E8C", textColor: "#FFFFFF",
    couponLeftBg: "#A8E6CF", couponRightBg: "#FFFFFF",
    couponLeftText: "#1A1A1A", couponRightText: "#1A1A1A",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
  "dark-luxury": {
    bgColor: "#1A1A1A", textColor: "#FFFFFF",
    couponLeftBg: "#C9A84C", couponRightBg: "#FFFFFF",
    couponLeftText: "#FFFFFF", couponRightText: "#1A1A1A",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
  "fresh-green": {
    bgColor: "#00A86B", textColor: "#FFFFFF",
    couponLeftBg: "#C8F5E0", couponRightBg: "#FFFFFF",
    couponLeftText: "#1A1A1A", couponRightText: "#00A86B",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
  "bold-orange": {
    bgColor: "#FF6B00", textColor: "#FFFFFF",
    couponLeftBg: "#FFE066", couponRightBg: "#FFFFFF",
    couponLeftText: "#1A1A1A", couponRightText: "#FF6B00",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
  "clean-white": {
    bgColor: "#FAFAFA", textColor: "#1A1A1A",
    couponLeftBg: "#E91E8C", couponRightBg: "#FFFFFF",
    couponLeftText: "#FFFFFF", couponRightText: "#1A1A1A",
    pillBg: "#E91E8C", pillText: "#FFFFFF",
  },
  "deep-blue": {
    bgColor: "#1565C0", textColor: "#FFFFFF",
    couponLeftBg: "#B3D9FF", couponRightBg: "#FFFFFF",
    couponLeftText: "#1A1A1A", couponRightText: "#1565C0",
    pillBg: "#FFFFFF", pillText: "#1A1A1A",
  },
};

function xe(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/**
 * Build the full text+coupon overlay SVG.
 * Layout (1080×1080):
 *  - Left half  (0..540): background colour + text content
 *  - Right half (540..1080): food image (composited separately)
 * We use text-anchor="middle" centred in the left column (x=270) so Arabic
 * glyphs stay fully within the left half regardless of string length.
 */
function buildOverlaySvg(
  cfg: BannerConfig,
  restaurantName: string,
  oldPrice: string,
  newPrice: string,
  tagline: string,
  fonts: { bold: string; regular: string; extraBold: string },
  S: number,
): string {
  // ── Parse price strings → numeric part + currency label ──────────────
  // Input like "10,000 ل.س" → { num: "10,000", currency: "ل.س" }
  const parsePrice = (p: string) => {
    const m = p.trim().match(/^([\d,\.]+)\s*(.*)$/);
    return m ? { num: m[1], unit: m[2].trim() } : { num: p, unit: "" };
  };
  const oldP = parsePrice(oldPrice);
  const newP = parsePrice(newPrice);
  const oldPriceNum = oldP.num;
  const newPriceNum = newP.num;
  const currency = newP.unit || oldP.unit || "ل.س";

  // ── Tagline lines ────────────────────────────────────────────────────
  // Always split into 2 lines when ≥2 words — Arabic at 58px fits ~460px
  const words = tagline.trim().split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const lines: string[] =
    words.length === 1
      ? [tagline]
      : [words.slice(0, half).join(" "), words.slice(half).join(" ")];

  // Right-anchor Arabic text at x=510 → text extends leftward, stays within left column
  const textRX = 510;

  // Font sizes: single word → 80px bold; two lines → 58px each
  const fs1 = lines.length === 1 ? 80 : 58;
  const fs2 = 58;
  const tagY = lines.length === 1 ? 480 : 400;

  // ── Coupon ───────────────────────────────────────────────────────────
  const cX = 54, cY = 770, cW = 490, cH = 124, cR = 22;
  const half2 = cW / 2;

  // ── Shared font-face declaration ─────────────────────────────────────
  const fontFace = `
    @font-face{font-family:'Tajawal';font-weight:400;src:url('data:font/truetype;base64,${fonts.regular}') format('truetype');}
    @font-face{font-family:'Tajawal';font-weight:700;src:url('data:font/truetype;base64,${fonts.bold}') format('truetype');}
    @font-face{font-family:'Tajawal';font-weight:800;src:url('data:font/truetype;base64,${fonts.extraBold}') format('truetype');}
  `;

  // Arabic text: right edge anchored at x, text flows leftward naturally via bidi
  const arText = (x: number, y: number, fs: number, fw: number, fill: string, text: string, anchor = "end") =>
    `<text x="${x}" y="${y}" font-family="Tajawal" font-weight="${fw}" font-size="${fs}" fill="${fill}"
      text-anchor="${anchor}" dominant-baseline="middle">${xe(text)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <style>${fontFace}</style>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${cfg.bgColor}" stop-opacity="1"/>
    <stop offset="52%"  stop-color="${cfg.bgColor}" stop-opacity="1"/>
    <stop offset="78%"  stop-color="${cfg.bgColor}" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="${cfg.bgColor}" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="couponClip">
    <rect x="${cX}" y="${cY}" width="${cW}" height="${cH}" rx="${cR}" ry="${cR}"/>
  </clipPath>
</defs>

<!-- Left-column background + fade so text stays readable -->
<rect width="${S}" height="${S}" fill="url(#fade)"/>

<!-- Restaurant name pill -->
<rect x="54" y="54" width="240" height="66" rx="33" fill="${cfg.pillBg}"/>
${arText(280, 87, 30, 700, cfg.pillText, restaurantName, "middle")}

<!-- Tagline — right edge at textRX, text flows left -->
${arText(textRX, tagY, fs1, lines.length === 1 ? 800 : 700, cfg.textColor, lines[0])}
${lines[1] ? arText(textRX, tagY + 92, fs2, 800, cfg.textColor, lines[1]) : ""}

<!-- Coupon -->
<g clip-path="url(#couponClip)">
  <rect x="${cX}" y="${cY}" width="${cW}" height="${cH}" fill="${cfg.couponRightBg}"/>
  <rect x="${cX}" y="${cY}" width="${half2}" height="${cH}" fill="${cfg.couponLeftBg}"/>
</g>
<line x1="${cX + half2}" y1="${cY + 14}" x2="${cX + half2}" y2="${cY + cH - 14}"
  stroke="#BBBBBB88" stroke-width="2.5" stroke-dasharray="8,5"/>

<!-- Old price: separate number + currency to avoid bidi issues -->
<text x="${cX + half2 / 2}" y="${cY + 36}"
  font-family="Tajawal" font-weight="700" font-size="30" fill="${cfg.couponLeftText}"
  text-anchor="middle" dominant-baseline="middle">${xe(oldPriceNum)}</text>
<!-- Strikethrough exactly at the number's midline -->
<line x1="${cX + 20}" y1="${cY + 36}" x2="${cX + half2 - 20}" y2="${cY + 36}"
  stroke="${cfg.couponLeftText}" stroke-width="2.5"/>
<text x="${cX + half2 / 2}" y="${cY + 78}"
  font-family="Tajawal" font-weight="400" font-size="22" fill="${cfg.couponLeftText}"
  text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

<!-- New price label -->
<text x="${cX + half2 + half2 / 2}" y="${cY + 28}"
  font-family="Tajawal" font-weight="400" font-size="20" fill="${cfg.couponRightText}"
  text-anchor="middle" dominant-baseline="middle">السعر الجديد</text>

<!-- New price: separate number + currency -->
<text x="${cX + half2 + half2 / 2}" y="${cY + 68}"
  font-family="Tajawal" font-weight="800" font-size="42" fill="${cfg.couponRightText}"
  text-anchor="middle" dominant-baseline="middle">${xe(newPriceNum)}</text>
<text x="${cX + half2 + half2 / 2}" y="${cY + 102}"
  font-family="Tajawal" font-weight="400" font-size="18" fill="${cfg.couponRightText}"
  text-anchor="middle" dominant-baseline="middle">${xe(currency)}</text>

</svg>`;
}

export async function composeBanner(
  config: BannerConfig,
  restaurantName: string,
  oldPrice: string,
  newPrice: string,
  tagline: string,
  foodImageBuffer?: Buffer,
): Promise<Buffer> {
  const fonts = ensureFonts();
  const S = 1080;

  // 1 — solid background
  const { r, g, b } = hexToRgb(config.bgColor);
  let base: Buffer = await sharp({
    create: { width: S, height: S, channels: 3, background: { r, g, b } },
  }).png().toBuffer();

  // 2 — food image: RIGHT half only (starts at 55% of canvas width)
  if (foodImageBuffer) {
    // Square crop, height = full canvas height
    const foodH = S;
    const foodW = S;

    const resized = await sharp(foodImageBuffer)
      .resize(foodW, foodH, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();

    // Crop to right portion so food occupies x=590..1080 (490px wide)
    const cropLeft = Math.round(foodW * 0.55); // take right 45% of the square
    const cropW = foodW - cropLeft;
    const cropped = await sharp(resized)
      .extract({ left: cropLeft, top: 0, width: cropW, height: foodH })
      .png()
      .toBuffer();

    // Place at right edge of canvas
    const left = S - cropW;
    base = await sharp(base)
      .composite([{ input: cropped, left, top: 0, blend: "over" }])
      .png()
      .toBuffer();
  }

  // 3 — overlay: fade + text + coupon (transparent everywhere except left column)
  const overlaySvg = Buffer.from(
    buildOverlaySvg(config, restaurantName, oldPrice, newPrice, tagline, fonts, S),
  );
  const result = await sharp(base)
    .composite([{ input: overlaySvg, blend: "over" }])
    .png()
    .toBuffer();

  return result;
}
