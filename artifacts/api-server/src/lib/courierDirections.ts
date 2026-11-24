// Sends an iPhone courier a WhatsApp message with a tappable map link at the two
// moments they need to navigate: the restaurant when they accept an order, and the
// customer when they mark it collected. On iPhones the app does not open turn-by-turn
// directions; a map link in WhatsApp always does. Android couriers navigate from the
// app and get no message.
//
// Best effort by design: a failed or disabled message must never affect the order.

import { pool } from "@workspace/db";
import { logger } from "./logger";
import { whatsappManager } from "./whatsapp";

export type DirectionsStage = "to_restaurant" | "to_customer";

/** Admin switch (system_settings). On unless explicitly set to "false". */
export const DIRECTIONS_SETTING_KEY = "courier_whatsapp_directions";

/** Adds the column that records which phone a user last registered for notifications from. */
export async function ensureDevicePlatformSchema(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS device_platform TEXT`);
}

/** Called when the app registers a native push token: iOS sends an APNs token, Android an FCM one. */
export async function recordDevicePlatform(userId: string, platform: "ios" | "android"): Promise<void> {
  await pool.query(`UPDATE users SET device_platform = $2 WHERE id = $1`, [userId, platform]).catch(() => {});
}

/**
 * Is this courier on an iPhone? The platform of their latest token registration decides.
 * Couriers who have not opened the app since that started being recorded fall back to
 * "has an APNs token", which only an iPhone can produce.
 */
export function isIphoneCourier(row: { device_platform?: unknown; apn_token?: unknown }): boolean {
  if (row.device_platform === "ios") return true;
  if (row.device_platform === "android") return false;
  return row.apn_token != null && row.apn_token !== "";
}

type Place = { lat: number | null; lon: number | null };

const hasPin = (p: Place): p is { lat: number; lon: number } =>
  typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
  !(p.lat === 0 && p.lon === 0);

const coord = (n: number) => n.toFixed(6);

/** Opens driving directions from the courier's current position in Google Maps (app or browser). */
export function googleDirectionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(lat)},${coord(lon)}&travelmode=driving`;
}

/** Same destination in Apple Maps, which every iPhone has. */
export function appleDirectionsUrl(lat: number, lon: number): string {
  return `https://maps.apple.com/?daddr=${coord(lat)},${coord(lon)}&dirflg=d`;
}

/** Map search by name, for a place with no pin: an errand's shop, or a restaurant missing its location. */
export function googleSearchUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

export function appleSearchUrl(name: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(name)}`;
}

export interface DirectionsInput {
  stage: DirectionsStage;
  orderId: string;
  /** Restaurant name, or the place name for an errand. */
  placeName: string;
  placePhone: string;
  place: Place;
  customerName: string;
  customerPhone: string;
  address: string;
  destination: Place;
  orderText: string;
}

const shortId = (id: string) => `#${id.slice(-6)}`;

/** The message text, or null when there is nothing useful to send (no pin for this stage). */
export function directionsText(i: DirectionsInput): string | null {
  if (i.stage === "to_restaurant") {
    if (!hasPin(i.place)) {
      // Errand ("طلب حر"): the customer typed a place name, there is no pin. Send what to
      // buy and a map search for the name instead of staying silent.
      const name = i.placeName.trim();
      if (!name) return null;
      return [
        `🛍 *طلب جديد ${shortId(i.orderId)}*`,
        `📍 المكان: *${name}*`,
        i.placePhone ? `📞 ${i.placePhone}` : null,
        i.orderText ? `🧾 ${i.orderText.slice(0, 300)}` : null,
        "",
        `🗺 دوّر عليه بخرائط غوغل:\n${googleSearchUrl(`${name} حمص`)}`,
        `🍎 خرائط آبل:\n${appleSearchUrl(`${name} حمص`)}`,
        "",
        "ما في موقع محدد لهالمكان، فالرابط بحث بالاسم. بس تستلم الطلب اكبس «استلمت الطلب» وبنبعتلك موقع الزبون.",
      ].filter((l) => l !== null).join("\n");
    }
    return [
      `🛵 *طلب جديد ${shortId(i.orderId)}*`,
      `📍 الاستلام من: *${i.placeName || "المطعم"}*`,
      i.placePhone ? `📞 ${i.placePhone}` : null,
      i.orderText ? `🧾 ${i.orderText.slice(0, 160)}` : null,
      "",
      `🗺 خرائط غوغل:\n${googleDirectionsUrl(i.place.lat, i.place.lon)}`,
      `🍎 خرائط آبل:\n${appleDirectionsUrl(i.place.lat, i.place.lon)}`,
      "",
      "بس تستلم الطلب اكبس «استلمت الطلب» بالتطبيق وبنبعتلك موقع الزبون.",
    ].filter((l) => l !== null).join("\n");
  }
  if (!hasPin(i.destination)) return null;
  return [
    `📦 *استلمت الطلب ${shortId(i.orderId)}، هلّق عالزبون*`,
    `👤 ${i.customerName || "الزبون"}${i.customerPhone ? ` · 📞 ${i.customerPhone}` : ""}`,
    i.address ? `🏠 ${i.address.slice(0, 200)}` : null,
    "",
    `🗺 خرائط غوغل:\n${googleDirectionsUrl(i.destination.lat, i.destination.lon)}`,
    `🍎 خرائط آبل:\n${appleDirectionsUrl(i.destination.lat, i.destination.lon)}`,
  ].filter((l) => l !== null).join("\n");
}

async function directionsEnabled(): Promise<boolean> {
  const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [DIRECTIONS_SETTING_KEY]);
  return String(rows[0]?.value ?? "true").toLowerCase() !== "false";
}

/** Loads the order and messages its courier. Resolves to whether a message went out; never throws. */
export async function sendCourierDirections(orderId: string, stage: DirectionsStage): Promise<boolean> {
  try {
    if (!(await directionsEnabled())) return false;
    const { rows } = await pool.query(
      `SELECT o.id, o.order_text, o.address, o.restaurant_name, o.restaurant_phone, o.place_name,
              o.destination_lat, o.destination_lon,
              COALESCE(r.lat, o.pickup_lat) AS r_lat, COALESCE(r.lon, o.pickup_lon) AS r_lon, r.phone AS r_phone,
              c.phone AS courier_phone, c.apn_token, c.device_platform, u.name AS customer_name, u.phone AS customer_phone
       FROM orders o
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN users c ON c.id = o.courier_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1 LIMIT 1`,
      [orderId],
    );
    const o = rows[0];
    if (!o?.courier_phone) return false;
    if (!isIphoneCourier(o)) return false;
    const num = (v: unknown): number | null => (v == null ? null : Number(v));
    const text = directionsText({
      stage,
      orderId: String(o.id),
      placeName: String(o.restaurant_name || o.place_name || ""),
      placePhone: String(o.restaurant_phone || o.r_phone || ""),
      place: { lat: num(o.r_lat), lon: num(o.r_lon) },
      customerName: String(o.customer_name ?? ""),
      customerPhone: String(o.customer_phone ?? ""),
      address: String(o.address ?? ""),
      destination: { lat: num(o.destination_lat), lon: num(o.destination_lon) },
      orderText: String(o.order_text ?? ""),
    });
    if (!text) return false;
    const ok = await whatsappManager.sendMessage(String(o.courier_phone), text);
    if (!ok) logger.warn({ orderId, stage }, "[directions] WhatsApp message not sent");
    return ok;
  } catch (err) {
    logger.warn({ err, orderId, stage }, "[directions] failed");
    return false;
  }
}
