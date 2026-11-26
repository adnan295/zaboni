// «محادثة الطلب» — see lib/orderChat.ts.
//   GET  /orders/:id/messages            the chat, my role, whether it is open, unread count
//   POST /orders/:id/messages            { text } or { lat, lon, accuracy } (customer only)
//   POST /orders/:id/messages/read       the other side's messages are now read
//   GET  /route?points=lat,lon;lat,lon    the streets between map points (lib/tripRoute.ts)
import { Router, type IRouter } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import {
  ChatError, listMessages, locationWhatsappText, markRead, markSentToWhatsapp, sendLocation, sendText,
  type ChatMessage, type Sent,
} from "../lib/orderChat";
import { whatsappManager } from "../lib/whatsapp";
import { sendTransientPushToUsers } from "../lib/push";
import { logger } from "../lib/logger";
import { parsePoints, tripRoute } from "../lib/tripRoute";

const router: IRouter = Router();

const body = z.union([
  z.object({ text: z.string() }),
  z.object({ lat: z.number(), lon: z.number(), accuracy: z.number().nullable().optional() }),
]);

function fail(res: import("express").Response, err: unknown) {
  if (err instanceof ChatError) return res.status(err.status).json({ error: err.code });
  logger.error({ err }, "[order-chat] failed");
  return res.status(500).json({ error: "server_error" });
}

/** Sends the customer's location to the courier's WhatsApp. Best effort: the chat already has it. */
async function forwardLocationToCourier(orderId: string, m: ChatMessage): Promise<boolean> {
  if (m.lat == null || m.lon == null) return false;
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.address, o.restaurant_name, o.place_name, c.phone AS courier_phone
       FROM orders o LEFT JOIN users c ON c.id = o.courier_id WHERE o.id = $1 LIMIT 1`,
      [orderId],
    );
    const o = rows[0];
    if (!o?.courier_phone) return false;
    const text = locationWhatsappText({
      orderId: String(o.id),
      placeName: String(o.restaurant_name || o.place_name || ""),
      address: String(o.address ?? ""),
      lat: m.lat, lon: m.lon, accuracy: m.accuracy,
    });
    const ok = await whatsappManager.sendMessage(String(o.courier_phone), text);
    if (ok) await markSentToWhatsapp(m.id);
    return ok;
  } catch (err) {
    logger.warn({ err, orderId }, "[order-chat] WhatsApp forward failed");
    return false;
  }
}

function notifyOtherSide(orderId: string, sent: Sent) {
  const { message: m, access } = sent;
  const to = m.from === "customer" ? access.courierId : access.customerId;
  if (!to) return;
  const title = m.from === "customer" ? "رسالة من الزبون" : "رسالة من مندوبك";
  const text = m.kind === "location" ? "📍 بعتلك موقعو الدقيق" : (m.text ?? "").slice(0, 120);
  void sendTransientPushToUsers([to], title, text, { type: "order_chat", orderId }).catch((err) =>
    logger.warn({ err, orderId }, "[order-chat] push failed"));
}

router.get("/orders/:id/messages", async (req, res) => {
  try {
    res.json(await listMessages(String(req.params.id), req.auth!.userId));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/orders/:id/messages/read", async (req, res) => {
  try {
    await markRead(String(req.params.id), req.auth!.userId);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/orders/:id/messages", async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  const orderId = String(req.params.id);
  try {
    const sent = "text" in parsed.data
      ? await sendText(orderId, req.auth!.userId, parsed.data.text)
      : await sendLocation(orderId, req.auth!.userId, parsed.data.lat, parsed.data.lon, parsed.data.accuracy ?? null);
    if (sent.message.kind === "location") {
      sent.message.sentToWhatsapp = await forwardLocationToCourier(orderId, sent.message);
    }
    notifyOtherSide(orderId, sent);
    res.status(201).json({ message: sent.message });
  } catch (err) {
    fail(res, err);
  }
});

// The streets between the map's points (courier, restaurant, home), for the tracking line.
router.get("/route", async (req, res) => {
  const pts = parsePoints(req.query.points);
  if (!pts) {
    res.status(400).json({ error: "bad_points" });
    return;
  }
  res.json(await tripRoute(pts));
});

export default router;
