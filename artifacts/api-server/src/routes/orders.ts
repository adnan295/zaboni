import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, orderStatusHistoryTable, orderRatingsTable, restaurantsTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

const DAMASCUS_CENTER_LAT = 33.5138;
const DAMASCUS_CENTER_LON = 36.2765;

function randomDamascusCoord(): { lat: number; lon: number } {
  const latSpread = 0.12;
  const lonSpread = 0.15;
  return {
    lat: DAMASCUS_CENTER_LAT + (Math.random() - 0.5) * latSpread * 2,
    lon: DAMASCUS_CENTER_LON + (Math.random() - 0.5) * lonSpread * 2,
  };
}

const router: IRouter = Router();

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
  const destination = randomDamascusCoord();

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

router.get("/orders/ratings", async (req, res) => {
  const userId = resolveUserId(req);
  const rows = await db
    .select()
    .from(orderRatingsTable)
    .where(eq(orderRatingsTable.userId, userId))
    .orderBy(orderRatingsTable.createdAt);
  res.json(rows);
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

const rateOrderSchema = z.object({
  restaurantStars: z.number().int().min(1).max(5),
  courierStars: z.number().int().min(1).max(5),
  comment: z.string().max(500).default(""),
  restaurantName: z.string().default(""),
});

router.post("/orders/:id/rate", async (req, res) => {
  const userId = resolveUserId(req);
  const orderId = String(req.params["id"]);

  const order = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)));
  if (order.length === 0) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order[0]!.status !== "delivered") {
    res.status(400).json({ error: "Order not yet delivered" });
    return;
  }

  const existing = await db
    .select()
    .from(orderRatingsTable)
    .where(and(eq(orderRatingsTable.orderId, orderId), eq(orderRatingsTable.userId, userId)));
  if (existing.length > 0) {
    res.status(409).json({ error: "Already rated" });
    return;
  }

  const body = rateOrderSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const o = order[0]!;
  const restaurantName = o.restaurantName || body.data.restaurantName;

  let restaurantId: string | null = null;
  if (restaurantName) {
    const found = await db
      .select({ id: restaurantsTable.id })
      .from(restaurantsTable)
      .where(
        or(
          eq(restaurantsTable.name, restaurantName),
          eq(restaurantsTable.nameAr, restaurantName),
        ),
      )
      .limit(1);
    restaurantId = found[0]?.id ?? null;
  }

  const ratingId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const rows = await db
    .insert(orderRatingsTable)
    .values({
      id: ratingId,
      orderId,
      userId,
      courierId: o.courierId,
      restaurantId,
      restaurantStars: body.data.restaurantStars,
      courierStars: body.data.courierStars,
      comment: body.data.comment,
      restaurantName,
    })
    .returning();

  res.status(201).json(rows[0]);
});

export default router;
