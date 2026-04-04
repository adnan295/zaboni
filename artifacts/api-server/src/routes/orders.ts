import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, orderStatusHistoryTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const MOCK_COURIERS = [
  { id: "c1", name: "أحمد الزهراني", phone: "+966 50 123 4567", rating: 4.9 },
  { id: "c2", name: "علي المطيري", phone: "+966 55 234 5678", rating: 4.8 },
  { id: "c3", name: "محمد القحطاني", phone: "+966 54 345 6789", rating: 4.7 },
  { id: "c4", name: "سعد العتيبي", phone: "+966 56 456 7890", rating: 4.9 },
  { id: "c5", name: "عبدالله الشمري", phone: "+966 57 567 8901", rating: 5.0 },
  { id: "c6", name: "خالد الدوسري", phone: "+966 58 678 9012", rating: 4.8 },
];

const createOrderSchema = z.object({
  orderText: z.string().min(1),
  restaurantName: z.string().default(""),
  address: z.string().default(""),
});

const updateStatusSchema = z.object({
  status: z.enum(["searching", "accepted", "on_way", "delivered"]),
});

function resolveUserId(req: Request): string {
  return req.auth!.userId;
}

router.get("/orders", async (req, res) => {
  const userId = resolveUserId(req);
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(ordersTable.createdAt);
  res.json(rows);
});

router.post("/orders", async (req, res) => {
  const body = createOrderSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const userId = resolveUserId(req);
  const id = `${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
  const estimatedMinutes = Math.floor(Math.random() * 15) + 30;

  const newOrder = {
    id,
    userId,
    orderText: body.data.orderText,
    restaurantName: body.data.restaurantName,
    status: "searching" as const,
    courierName: "",
    courierPhone: "",
    courierRating: 0,
    courierId: "",
    address: body.data.address,
    estimatedMinutes,
  };

  const rows = await db.insert(ordersTable).values(newOrder).returning();

  await db.insert(orderStatusHistoryTable).values({
    id: `${id}_searching`,
    orderId: id,
    status: "searching",
  });

  res.status(201).json(rows[0]);
});

router.get("/orders/:id", async (req, res) => {
  const userId = resolveUserId(req);
  const { id } = req.params;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)));
  if (rows.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(rows[0]);
});

router.patch("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const body = updateStatusSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const userId = resolveUserId(req);

  const rows = await db
    .update(ordersTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)))
    .returning();

  if (rows.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  await db.insert(orderStatusHistoryTable).values({
    id: `${id}_${body.data.status}_${Date.now()}`,
    orderId: id,
    status: body.data.status,
  });

  res.json(rows[0]);
});

export default router;
