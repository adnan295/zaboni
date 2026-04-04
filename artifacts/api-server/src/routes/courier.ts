import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, ordersTable, orderStatusHistoryTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { notifyOrderUpdate, sendOrderPush } from "../orders/server";

const router: IRouter = Router();

function resolveUserId(req: Request): string {
  return req.auth!.userId;
}

async function requireCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = resolveUserId(req);
  const users = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!users[0] || users[0].role !== "courier") {
    res.status(403).json({ error: "Only couriers can access this endpoint" });
    return;
  }
  next();
}

router.post("/courier/register", async (req, res) => {
  const userId = resolveUserId(req);

  const rows = await db
    .update(usersTable)
    .set({ role: "courier" })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name, role: usersTable.role });

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(rows[0]);
});

router.get("/courier/orders/available", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.status, "searching"), eq(ordersTable.courierId, "")))
    .orderBy(ordersTable.createdAt);

  res.json(rows.filter((o) => o.userId !== courierId));
});

router.get("/courier/orders/active", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.courierId, courierId))
    .orderBy(ordersTable.updatedAt);

  res.json(rows.filter((o) => o.status === "accepted" || o.status === "on_way"));
});

router.post("/courier/orders/:orderId/accept", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const order = orders[0];

  if (order.status !== "searching" || order.courierId !== "") {
    res.status(409).json({ error: "Order is no longer available" });
    return;
  }

  if (order.userId === courierId) {
    res.status(400).json({ error: "Cannot accept your own order" });
    return;
  }

  const courierUsers = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, courierId))
    .limit(1);

  const courierName = courierUsers[0]?.name || "مندوب";
  const courierPhone = courierUsers[0]?.phone || "";

  const updated = await db
    .update(ordersTable)
    .set({ courierId, courierName, courierPhone, courierRating: 5.0, status: "accepted", updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, ""), eq(ordersTable.status, "searching")))
    .returning();

  if (updated.length === 0) {
    res.status(409).json({ error: "Order was already accepted by another courier" });
    return;
  }

  await db.insert(orderStatusHistoryTable).values({
    id: `${orderId}_accepted_${Date.now()}`,
    orderId,
    status: "accepted",
  });

  notifyOrderUpdate(order.userId, updated[0]);
  await sendOrderPush(order.userId, `${courierName} قبل طلبك وفي الطريق إليك!`);

  res.json(updated[0]);
});

const courierStatusSchema = z.object({
  status: z.enum(["on_way", "delivered"]),
});

router.patch("/courier/orders/:orderId/status", requireCourier, async (req, res) => {
  const courierId = resolveUserId(req);
  const orderId = String(req.params["orderId"]);

  const body = courierStatusSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid status — must be on_way or delivered" });
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, courierId)))
    .limit(1);

  if (orders.length === 0) {
    res.status(404).json({ error: "Order not found or not your order" });
    return;
  }

  const updated = await db
    .update(ordersTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, courierId)))
    .returning();

  if (updated.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  await db.insert(orderStatusHistoryTable).values({
    id: `${orderId}_${body.data.status}_${Date.now()}`,
    orderId,
    status: body.data.status,
  });

  notifyOrderUpdate(orders[0].userId, updated[0]);

  const pushMsg =
    body.data.status === "on_way"
      ? "المندوب في الطريق إليك 🛵"
      : "تم التوصيل بنجاح 🎉 بالعافية!";
  await sendOrderPush(orders[0].userId, pushMsg);

  res.json(updated[0]);
});

export default router;
