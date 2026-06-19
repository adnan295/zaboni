import sharp from "sharp";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.join(__dirname, "fonts");
export const ASSETS_DIR = path.join(__dirname, "assets");

export interface BannerInput {
  restaurantName: string;
  oldPrice: string;
  newPrice: string;
  tagline: string;
  couponCode?: string;
  foodImageBuffer?: Buffer;
  restaurantLogoBuffer?: Buffer;
  appLogoBuffer: Buffer;
}

export interface LayoutPalette {
  [key: string]: string;
}

let _fonts: { bold: string; regular: string; extraBold: string } | null = null;
export function ensureFonts() {
  if (_fonts) return _fonts;
  _fonts = {
    regular: readFileSync(path.join(FONTS_DIR, "Tajawal-Regular.ttf")).toString("base64"),
    bold: readFileSync(path.join(FONTS_DIR, "Tajawal-Bold.ttf")).toString("base64"),
    extraBold: readFileSync(path.join(FONTS_DIR, "Tajawal-ExtraBold.ttf")).toString("base64"),
  };
  return _fonts;
}

let _appLogoPng: Buffer | null = null;
export async function ensureAppLogo(): Promise<Buffer> {
  if (_appLogoPng) return _appLogoPng;
  const svgPath = path.join(ASSETS_DIR, "zaboni-logo.svg");
  if (existsSync(svgPath)) {
    try {
      _appLogoPng = await sharp(svgPath).resize(200, 200).png().toBuffer();
      return _appLogoPng;
    } catch {
      // fall through to programmatic fallback
    }
  }
  // Programmatic fallback: pink rounded square with white Z-mark
  const fallbackSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" rx="44" fill="#E91E8C"/>
    <rect x="50" y="66" width="100" height="14" rx="7" fill="white"/>
    <rect x="50" y="120" width="100" height="14" rx="7" fill="white"/>
    <polygon points="150,66 150,80 64,120 64,134 50,134 50,120 136,80 136,66" fill="white"/>
  </svg>`);
  _appLogoPng = await sharp(fallbackSvg).resize(200, 200).png().toBuffer();
  return _appLogoPng;
}

export function xe(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function parsePrice(p: string) {
  const m = p.trim().match(/^([\d,\.]+)\s*(.*)$/);
  return m ? { num: m[1]!, unit: m[2]!.trim() } : { num: p, unit: "" };
}

export function calcDiscountPct(oldPrice: string, newPrice: string): number {
  const oldP = parsePrice(oldPrice);
  const newP = parsePrice(newPrice);
  const oldN = parseFloat(oldP.num.replace(/,/g, ""));
  const newN = parseFloat(newP.num.replace(/,/g, ""));
  if (!oldN || oldN <= newN) return 0;
  return Math.round((1 - newN / oldN) * 100);
}

export function splitTagline(tagline: string, maxWords = 2): string[] {
  const words = tagline.trim().split(/\s+/);
  if (words.length <= maxWords) return [tagline];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

export function fontFaceBlock(fonts: { bold: string; regular: string; extraBold: string }) {
  return `
@font-face{font-family:'Tajawal';font-weight:400;src:url('data:font/truetype;base64,${fonts.regular}') format('truetype');}
@font-face{font-family:'Tajawal';font-weight:700;src:url('data:font/truetype;base64,${fonts.bold}') format('truetype');}
@font-face{font-family:'Tajawal';font-weight:800;src:url('data:font/truetype;base64,${fonts.extraBold}') format('truetype');}
`.trim();
}

export async function makeCircularBuffer(buf: Buffer, size: number): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
  );
  const resized = await sharp(buf).resize(size, size, { fit: "cover" }).png().toBuffer();
  return sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

export async function makeOvalBuffer(buf: Buffer, w: number, h: number): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="white"/></svg>`,
  );
  const resized = await sharp(buf).resize(w, h, { fit: "cover" }).png().toBuffer();
  return sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

export async function bufferToBase64Png(buf: Buffer, size: number): Promise<string> {
  const png = await sharp(buf).resize(size, size, { fit: "cover" }).png().toBuffer();
  return png.toString("base64");
}
