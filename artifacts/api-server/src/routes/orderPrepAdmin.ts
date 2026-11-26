// Admin side of «عم يتحضّر» (lib/orderPrep.ts):
//   POST /admin/orders/:id/ordered-from-restaurant   «طلبناه من المطعم»
//   GET  /admin/orders/:id/courier-options          nearest couriers to the restaurant
//   POST /admin/orders/:id/assign { courierId }      hand the order to a courier
//   GET/PUT /admin/order-prep/settings              on/off and the admin's hours
import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, ordersTable, usersTable, orderStatusHistoryTable, orderRatingsTable, restaurantsTable, pool } from "@workspace/db";
import { and, avg, eq, gt, notInArray } from "drizzle-orm";
import { requireAdmin } from "../middleware/adminAuth";
import { autoPrepActive, getAutoPrep, markOrderedByAdmin, PrepError, saveAutoPrep, validAutoPrep } from "../lib/orderPrep";
import { haversineKm } from "../lib/deliveryZones";
import { notifyCouriersOrderTaken, notifyOrderUpdate, sendOrderPush } from "../orders/server";
import { sendCourierDirections } from "../lib/courierDirections";
import { recordPromisedEta } from "../lib/deliveryEstimates";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// On/off and the admin's hours for «عم يتحضّر» after a minute.
router.get("/admin/order-prep/settings", requireAdmin, async (_req, res) => {
  const settings = await getAutoPrep();
  res.json({ ...settings, activeNow: autoPrepActive(settings) });
});

router.put("/admin/order-prep/settings", requireAdmin, async (req, res) => {
  const body = z.object({ enabled: z.boolean(), from: z.string(), to: z.string() }).safeParse(req.body);
  if (!body.success || !validAutoPrep(body.data)) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  await saveAutoPrep(body.data);
  res.json({ ...body.data, activeNow: autoPrepActive(body.data) });
});

router.post("/admin/orders/:id/ordered-from-restaurant", requireAdmin, async (req, res) => {
  try {
    const r = await markOrderedByAdmin(String(req.params.id), "admin");
    res.json({ ok: true, orderedAt: r.orderedAt });
  } catch (err) {
    if (err instanceof PrepError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    throw err;
  }
});

const MAX_ACTIVE_ORDERS = 2;

router.get("/admin/orders/:id/courier-options", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { rows: [o] } = await pool.query(
    `SELECT COALESCE(r.lat, o.pickup_lat) AS lat, COALESCE(r.lon, o.pickup_lon) AS lon
     FROM orders o LEFT JOIN restaurants r ON r.id = o.restaurant_id WHERE o.id = $1`,
    [id],
  );
  if (!o) {
    res.status(404).json({ error: "order_not_found" });
    return;
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.phone, u.is_online, u.courier_lat, u.courier_lon, u.courier_location_updated_at,
            COUNT(a.id) FILTER (WHERE a.id IS NOT NULL)::int AS active,
            COUNT(a.id) FILTER (WHERE a.status = 'accepted')::int AS not_picked
     FROM users u
     LEFT JOIN orders a ON a.courier_id = u.id AND a.status IN ('accepted', 'picked_up', 'on_way')
     WHERE u.role = 'courier' AND COALESCE(u.is_blocked, FALSE) = FALSE AND u.is_online = TRUE
     GROUP BY u.id`,
  );
  const options = rows.map((c) => {
    const km = o.lat != null && c.courier_lat != null
      ? haversineKm(Number(c.courier_lat), Number(c.courier_lon), Number(o.lat), Number(o.lon))
      : null;
    const busy = Number(c.active) >= MAX_ACTIVE_ORDERS || Number(c.not_picked) > 0;
    return {
      id: String(c.id),
      name: String(c.name || "مندوب"),
      distanceKm: km == null ? null : Math.round(km * 10) / 10,
      activeOrders: Number(c.active),
      canTake: !busy,
    };
  }).sort((a, b) => (a.canTake === b.canTake ? (a.distanceKm ?? 999) - (b.distanceKm ?? 999) : a.canTake ? -1 : 1));
  res.json({ options: options.slice(0, 12) });
});

router.post("/admin/orders/:id/assign", requireAdmin, async (req, res) => {
  const body = z.object({ courierId: z.string().min(1) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  const orderId = String(req.params.id);
  const { courierId } = body.data;
  type Out = { ok: true; order: typeof ordersTable.$inferSelect; firstPrep: boolean } | { ok: false; status: number; message: string };
  const out: Out = await db.transaction(async (tx) => {
    await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, courierId)).for("update");
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order) return { ok: false, status: 404, message: "الطلب مو موجود" };
    if (order.status !== "searching" || order.courierId !== "") return { ok: false, status: 409, message: `الطلب صار مع ${order.courierName || "مندوب"}` };
    if (order.userId === courierId) return { ok: false, status: 400, message: "هاد طلب المندوب نفسو" };
    const [courier] = await tx.select({ name: usersTable.name, phone: usersTable.phone, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, courierId)).limit(1);
    if (!courier || courier.role !== "courier") return { ok: false, status: 404, message: "المندوب مو موجود" };
    const active = await tx.select({ status: ordersTable.status }).from(ordersTable)
      .where(and(eq(ordersTable.courierId, courierId), notInArray(ordersTable.status, ["delivered", "cancelled"])));
    if (active.length >= MAX_ACTIVE_ORDERS) return { ok: false, status: 409, message: "معو طلبين بالفعل" };
    if (active.some((a) => a.status === "accepted")) return { ok: false, status: 409, message: "لسا ما استلم طلبو الحالي من المطعم" };
    const [r] = await tx.select({ avg: avg(orderRatingsTable.courierStars) }).from(orderRatingsTable)
      .where(and(eq(orderRatingsTable.courierId, courierId), gt(orderRatingsTable.courierStars, 0)));
    const courierRating = r?.avg != null ? Math.round(Number(r.avg) * 10) / 10 : 0;
    const [updated] = await tx.update(ordersTable)
      .set({ courierId, courierName: courier.name || "مندوب", courierPhone: courier.phone || "", courierRating, status: "accepted", prepStartedAt: order.prepStartedAt ?? new Date(), updatedAt: new Date() })
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, ""), eq(ordersTable.status, "searching")))
      .returning();
    if (!updated) return { ok: false, status: 409, message: "الطلب تغيّر، جرّب مرة تانية" };
    await tx.insert(orderStatusHistoryTable).values({ id: `${orderId}_accepted_${Date.now()}`, orderId, status: "accepted", note: "admin_assigned" });
    return { ok: true, order: updated, firstPrep: order.prepStartedAt == null };
  });
  if (!out.ok) {
    res.status(out.status).json({ error: "cannot_assign", message: out.message });
    return;
  }
  const { order, firstPrep } = out;
  notifyOrderUpdate(order.userId, order);
  notifyOrderUpdate(courierId, order);
  notifyCouriersOrderTaken(orderId);
  if (firstPrep) void sendOrderPush(order.userId, "👨‍🍳 طلبك عم يتحضّر بالمطعم", orderId);
  const where = order.restaurantName || order.placeName || "طلب";
  void sendOrderPush(courierId, order.adminOrderedAt
    ? `📦 الإدارة حوّلتلك طلب من ${where} · الإدارة طلبتو من المطعم، روح استلم مباشرة`
    : `📦 الإدارة حوّلتلك طلب من ${where}`, orderId);
  void sendCourierDirections(orderId, "to_restaurant");
  void recordPromisedEta(orderId);
  logger.info({ orderId, courierId }, "[order-prep] admin assigned order");
  res.json({ ok: true, order });
});

export default router;
