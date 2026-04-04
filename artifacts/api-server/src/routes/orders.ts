import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, orderStatusHistoryTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const RIYADH_CENTER_LAT = 24.7136;
const RIYADH_CENTER_LON = 46.6753;

function randomRiyadhCoord(): { lat: number; lon: number } {
  const latSpread = 0.12;
  const lonSpread = 0.15;
  return {
    lat: RIYADH_CENTER_LAT + (Math.random() - 0.5) * latSpread * 2,
    lon: RIYADH_CENTER_LON + (Math.random() - 0.5) * lonSpread * 2,
  };
}

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
  const destination = randomRiyadhCoord();

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
    destinationLat: destination.lat,
    destinationLon: destination.lon,
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

export default router;
