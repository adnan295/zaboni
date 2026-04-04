import { Router, type IRouter } from "express";
import { db, chatMessagesTable, ordersTable, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

router.get("/chat/:orderId/messages", async (req, res) => {
  const { orderId } = req.params;
  const userId = req.auth!.userId;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  const order = orders[0];
  const isCustomer = order && order.userId === userId;
  const isCourier = order && order.courierId !== "" && order.courierId === userId;

  if (!order || (!isCustomer && !isCourier)) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.orderId, orderId))
    .orderBy(asc(chatMessagesTable.createdAt));

  res.json(messages);
});

const pushTokenSchema = z.object({ token: z.string().min(1) });

router.post("/push-token", async (req, res) => {
  const body = pushTokenSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const userId = req.auth!.userId;
  await db
    .update(usersTable)
    .set({ pushToken: body.data.token })
    .where(eq(usersTable.id, userId));

  res.json({ ok: true });
});

export default router;
