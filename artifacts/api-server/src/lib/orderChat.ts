// «محادثة الطلب»: the customer and the courier talk inside the app, never on
// WhatsApp, so neither side ever sees the other's number. The chat belongs to one
// order: it opens when a courier takes it and turns read-only once it is
// delivered or cancelled.
//
// When the customer sends their exact location, it is also sent to the
// courier's WhatsApp from Zaboni's own number, because that is where couriers
// open maps from. The customer never gets a WhatsApp message.

import crypto from "node:crypto";
import { pool } from "@workspace/db";

export type ChatRole = "customer" | "courier";

export interface ChatMessage {
  id: string;
  from: ChatRole;
  kind: "text" | "location";
  text: string | null;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  /** A phone number was hidden from this message. */
  masked: boolean;
  /** The location also reached the courier's WhatsApp. */
  sentToWhatsapp: boolean;
  createdAt: string;
  readAt: string | null;
}

export class ChatError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/** Order states where the chat accepts new messages. */
const OPEN_STATUSES = new Set(["accepted", "picked_up", "on_way"]);
/** Order states where a chat exists at all (it is kept read-only afterwards). */
const READABLE_STATUSES = new Set(["accepted", "picked_up", "on_way", "delivered", "cancelled"]);

export const MAX_TEXT_LENGTH = 500;
/** Messages one side may send per order in a minute, to keep the chat from being flooded. */
export const MAX_PER_MINUTE = 12;

export async function ensureOrderChatSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      lat DOUBLE PRECISION,
      lon DOUBLE PRECISION,
      accuracy REAL,
      masked BOOLEAN NOT NULL DEFAULT FALSE,
      wa_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS order_messages_order_idx ON order_messages (order_id, created_at)`);
}

// Western and Arabic-Indic digits, with the separators people type between them.
const DIGIT = "[0-9\\u0660-\\u0669\\u06F0-\\u06F9]";
const PHONE_LIKE = new RegExp(`(?:\\+|00)?${DIGIT}(?:[\\s\\-.()]*${DIGIT}){6,}`, "g");

/**
 * Hides anything that looks like a phone number (7+ digits, spaced or not).
 * The whole point of the chat is that numbers are never exchanged.
 */
export function maskPhoneNumbers(text: string): { text: string; masked: boolean } {
  let masked = false;
  const out = text.replace(PHONE_LIKE, () => {
    masked = true;
    return "••••••••";
  });
  return { text: out, masked };
}

interface OrderAccess {
  role: ChatRole;
  open: boolean;
  customerId: string;
  courierId: string | null;
}

/** Who this user is on this order, or an error when they have no part in it. */
export async function chatAccess(orderId: string, userId: string): Promise<OrderAccess> {
  const { rows } = await pool.query(`SELECT user_id, courier_id, status FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  const o = rows[0];
  if (!o) throw new ChatError(404, "order_not_found");
  const role: ChatRole | null =
    o.user_id === userId ? "customer" : o.courier_id != null && o.courier_id === userId ? "courier" : null;
  if (!role) throw new ChatError(403, "not_your_order");
  if (!READABLE_STATUSES.has(String(o.status)) || !o.courier_id) throw new ChatError(409, "no_courier_yet");
  return { role, open: OPEN_STATUSES.has(String(o.status)), customerId: String(o.user_id), courierId: o.courier_id ? String(o.courier_id) : null };
}

function toMessage(r: Record<string, unknown>): ChatMessage {
  const num = (v: unknown) => (v == null ? null : Number(v));
  const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
  return {
    id: String(r.id),
    from: r.sender_role as ChatRole,
    kind: r.kind === "location" ? "location" : "text",
    text: r.body == null ? null : String(r.body),
    lat: num(r.lat),
    lon: num(r.lon),
    accuracy: num(r.accuracy),
    masked: !!r.masked,
    sentToWhatsapp: !!r.wa_sent,
    createdAt: iso(r.created_at)!,
    readAt: iso(r.read_at),
  };
}

export async function listMessages(orderId: string, userId: string): Promise<{ role: ChatRole; open: boolean; unread: number; messages: ChatMessage[] }> {
  const access = await chatAccess(orderId, userId);
  const { rows } = await pool.query(
    `SELECT * FROM order_messages WHERE order_id = $1 ORDER BY created_at ASC, id ASC LIMIT 300`,
    [orderId],
  );
  const messages = rows.map(toMessage);
  const unread = messages.filter((m) => m.from !== access.role && !m.readAt).length;
  return { role: access.role, open: access.open, unread, messages };
}

/** The other side's messages count as read once this side opens the chat. */
export async function markRead(orderId: string, userId: string, now = new Date()): Promise<void> {
  const access = await chatAccess(orderId, userId);
  await pool.query(
    `UPDATE order_messages SET read_at = $3 WHERE order_id = $1 AND sender_role <> $2 AND read_at IS NULL`,
    [orderId, access.role, now],
  );
}

async function guardSend(orderId: string, userId: string, now: Date): Promise<OrderAccess> {
  const access = await chatAccess(orderId, userId);
  if (!access.open) throw new ChatError(409, "chat_closed");
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM order_messages WHERE order_id = $1 AND sender_id = $2 AND created_at > $3`,
    [orderId, userId, new Date(now.getTime() - 60_000)],
  );
  if (Number(rows[0]?.n ?? 0) >= MAX_PER_MINUTE) throw new ChatError(429, "too_many_messages");
  return access;
}

export interface Sent {
  message: ChatMessage;
  access: OrderAccess;
}

export async function sendText(orderId: string, userId: string, raw: string, now = new Date()): Promise<Sent> {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new ChatError(400, "empty_message");
  if (trimmed.length > MAX_TEXT_LENGTH) throw new ChatError(400, "message_too_long");
  const access = await guardSend(orderId, userId, now);
  const { text, masked } = maskPhoneNumbers(trimmed);
  const { rows } = await pool.query(
    `INSERT INTO order_messages (id, order_id, sender_id, sender_role, kind, body, masked, created_at)
     VALUES ($1, $2, $3, $4, 'text', $5, $6, $7) RETURNING *`,
    [crypto.randomUUID(), orderId, userId, access.role, text, masked, now],
  );
  return { message: toMessage(rows[0]), access };
}

const validLat = (v: number) => Number.isFinite(v) && v >= -90 && v <= 90 && v !== 0;
const validLon = (v: number) => Number.isFinite(v) && v >= -180 && v <= 180 && v !== 0;

/** Only the customer sends a location: it is where the order has to go. */
export async function sendLocation(
  orderId: string, userId: string, lat: number, lon: number, accuracy: number | null, now = new Date(),
): Promise<Sent> {
  if (!validLat(lat) || !validLon(lon)) throw new ChatError(400, "bad_location");
  const access = await guardSend(orderId, userId, now);
  if (access.role !== "customer") throw new ChatError(403, "customer_only");
  const acc = accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null;
  const { rows } = await pool.query(
    `INSERT INTO order_messages (id, order_id, sender_id, sender_role, kind, lat, lon, accuracy, created_at)
     VALUES ($1, $2, $3, 'customer', 'location', $4, $5, $6, $7) RETURNING *`,
    [crypto.randomUUID(), orderId, userId, lat, lon, acc, now],
  );
  return { message: toMessage(rows[0]), access };
}

export async function markSentToWhatsapp(messageId: string): Promise<void> {
  await pool.query(`UPDATE order_messages SET wa_sent = TRUE WHERE id = $1`, [messageId]);
}

/** What the courier's WhatsApp gets when the customer sends their location. No customer number in it. */
export function locationWhatsappText(input: {
  orderId: string; placeName: string; address: string; lat: number; lon: number; accuracy: number | null;
}): string {
  const c = (n: number) => n.toFixed(6);
  return [
    `📍 *موقع الزبون الدقيق · طلب #${input.orderId.slice(-6)}*`,
    input.placeName ? `🛍 ${input.placeName}` : null,
    input.address ? `🏠 العنوان المكتوب: ${input.address.slice(0, 200)}` : null,
    input.accuracy != null ? `🎯 دقة الموقع: ±${input.accuracy} م` : null,
    "",
    `🗺 خرائط غوغل:\nhttps://www.google.com/maps/dir/?api=1&destination=${c(input.lat)},${c(input.lon)}&travelmode=driving`,
    `🍎 خرائط آبل:\nhttps://maps.apple.com/?daddr=${c(input.lat)},${c(input.lon)}&dirflg=d`,
    "",
    "للتواصل مع الزبون: من محادثة الطلب بتطبيق زبوني.",
  ].filter((l) => l !== null).join("\n");
}
