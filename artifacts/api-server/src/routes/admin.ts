import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  restaurantsTable,
  menuItemsTable,
  ordersTable,
  usersTable,
  orderRatingsTable,
} from "@workspace/db";
import { eq, count, desc, gte, getTableColumns, and, sql, avg } from "drizzle-orm";
import { notifyOrderUpdate, sendOrderPush } from "../orders/server";
import { z } from "zod";

const ORDER_STATUSES = [
  "searching",
  "accepted",
  "picked_up",
  "on_way",
  "delivered",
  "cancelled",
] as const;

const router = Router();

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({
      error:
        "Admin panel is not configured. Set the ADMIN_SECRET environment variable.",
    });
    return;
  }
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
  if (!token || token !== ADMIN_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/admin", requireAdmin);

router.get("/admin/stats", async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [[restaurantRow], [orderRow], [userRow], [menuRow], [todayOrderRow], [courierRow], [yesterdayOrderRow]] =
    await Promise.all([
      db.select({ count: count() }).from(restaurantsTable),
      db.select({ count: count() }).from(ordersTable),
      db.select({ count: count() }).from(usersTable),
      db.select({ count: count() }).from(menuItemsTable),
      db
        .select({ count: count() })
        .from(ordersTable)
        .where(gte(ordersTable.createdAt, todayStart)),
      db
        .select({ count: count() })
        .from(usersTable)
        .where(eq(usersTable.role, "courier")),
      db
        .select({ count: count() })
        .from(ordersTable)
        .where(
          and(
            gte(ordersTable.createdAt, yesterdayStart),
            sql`${ordersTable.createdAt} < ${todayStart}`,
          ),
        ),
    ]);

  const ordersByStatus = await db
    .select({ status: ordersTable.status, count: count() })
    .from(ordersTable)
    .groupBy(ordersTable.status);

  const recentOrders = await db
    .select({
      ...getTableColumns(ordersTable),
      customerName: usersTable.name,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);

  res.json({
    restaurants: restaurantRow?.count ?? 0,
    orders: orderRow?.count ?? 0,
    todayOrders: todayOrderRow?.count ?? 0,
    yesterdayOrders: yesterdayOrderRow?.count ?? 0,
    users: userRow?.count ?? 0,
    couriers: courierRow?.count ?? 0,
    menuItems: menuRow?.count ?? 0,
    ordersByStatus,
    recentOrders,
  });
});

router.get("/admin/charts/daily", async (req, res) => {
  const daysRaw = parseInt(String(req.query["days"] ?? "30"));
  const days = [7, 14, 30].includes(daysRaw) ? daysRaw : 30;
  const rows = await db.execute(sql`
    WITH date_series AS (
      SELECT TO_CHAR(
        generate_series(
          (NOW() AT TIME ZONE 'Asia/Damascus' - CAST(${days - 1} || ' days' AS INTERVAL))::date,
          (NOW() AT TIME ZONE 'Asia/Damascus')::date,
          '1 day'::interval
        ),
        'YYYY-MM-DD'
      ) AS date
    ),
    daily_counts AS (
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'Asia/Damascus'), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM orders
      WHERE created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)
      GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'Asia/Damascus')
    )
    SELECT d.date, COALESCE(c.count, 0)::int AS count
    FROM date_series d
    LEFT JOIN daily_counts c ON c.date = d.date
    ORDER BY d.date
  `);
  res.json(rows.rows);
});

router.get("/admin/charts/hourly", async (_req, res) => {
  const rows = await db.execute(sql`
    WITH hour_series AS (
      SELECT generate_series(0, 23)::int AS hour
    ),
    hourly_counts AS (
      SELECT
        EXTRACT(hour FROM created_at AT TIME ZONE 'Asia/Damascus')::int AS hour,
        COUNT(*)::int AS count
      FROM orders
      GROUP BY hour
    )
    SELECT h.hour, COALESCE(c.count, 0)::int AS count
    FROM hour_series h
    LEFT JOIN hourly_counts c ON c.hour = h.hour
    ORDER BY h.hour
  `);
  res.json(rows.rows);
});

router.get("/admin/couriers", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      u.phone,
      u.created_at AS "createdAt",
      COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS "deliveredCount",
      COUNT(o.id) FILTER (WHERE o.status <> 'searching') AS "totalAssigned",
      ROUND(CAST(AVG(NULLIF(o.courier_rating, 0)) AS numeric), 1) AS "avgRating",
      MAX(o.updated_at) AS "lastDelivery"
    FROM users u
    LEFT JOIN orders o ON o.courier_id = u.id
    WHERE u.role = 'courier'
    GROUP BY u.id, u.name, u.phone, u.created_at
    ORDER BY u.created_at DESC
  `);
  res.json(
    rows.rows.map((r: Record<string, unknown>) => ({
      ...r,
      deliveredCount: Number(r["deliveredCount"] ?? 0),
      totalAssigned: Number(r["totalAssigned"] ?? 0),
      avgRating: r["avgRating"] != null ? Number(r["avgRating"]) : null,
    })),
  );
});

router.get("/admin/restaurants", async (_req, res) => {
  const rows = await db
    .select({
      ...getTableColumns(restaurantsTable),
      ordersCount: sql<number>`(
        SELECT COUNT(*) FROM ${ordersTable}
        WHERE ${ordersTable.restaurantName} = ${restaurantsTable.nameAr}
           OR ${ordersTable.restaurantName} = ${restaurantsTable.name}
      )`.as("orders_count"),
    })
    .from(restaurantsTable)
    .orderBy(restaurantsTable.name);
  res.json(rows);
});

const restaurantBody = z.object({
  name: z.string().min(1),
  nameAr: z.string().min(1),
  category: z.string().min(1),
  categoryAr: z.string().min(1),
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().default(0),
  deliveryTime: z.string().default("30-45 دقيقة"),
  deliveryFee: z.number().min(0).default(0),
  minOrder: z.number().min(0).default(0),
  image: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isOpen: z.boolean().default(true),
  discount: z.string().nullable().optional(),
});

router.post("/admin/restaurants", async (req, res) => {
  const parsed = restaurantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `rest_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(restaurantsTable)
    .values({ id, ...parsed.data })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/restaurants/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = restaurantBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(restaurantsTable)
    .set(parsed.data)
    .where(eq(restaurantsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/restaurants/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(restaurantsTable).where(eq(restaurantsTable.id, id));
  res.status(204).end();
});

router.get("/admin/restaurants/:id/menu", async (req, res) => {
  const restaurantId = String(req.params["id"]);
  const rows = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.restaurantId, restaurantId));
  res.json(rows);
});

const menuItemBody = z.object({
  name: z.string().min(1),
  nameAr: z.string().min(1),
  description: z.string().default(""),
  descriptionAr: z.string().default(""),
  price: z.number().min(0),
  image: z.string().min(1),
  category: z.string().min(1),
  categoryAr: z.string().min(1),
  isPopular: z.boolean().default(false),
});

router.post("/admin/restaurants/:id/menu", async (req, res) => {
  const restaurantId = String(req.params["id"]);
  const parsed = menuItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `item_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(menuItemsTable)
    .values({ id, restaurantId, ...parsed.data })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/restaurants/:restaurantId/menu/:itemId", async (req, res) => {
  const itemId = String(req.params["itemId"]);
  const restaurantId = String(req.params["restaurantId"]);
  const parsed = menuItemBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(menuItemsTable)
    .set(parsed.data)
    .where(
      and(
        eq(menuItemsTable.id, itemId),
        eq(menuItemsTable.restaurantId, restaurantId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/restaurants/:restaurantId/menu/:itemId", async (req, res) => {
  const itemId = String(req.params["itemId"]);
  const restaurantId = String(req.params["restaurantId"]);
  await db
    .delete(menuItemsTable)
    .where(
      and(
        eq(menuItemsTable.id, itemId),
        eq(menuItemsTable.restaurantId, restaurantId),
      ),
    );
  res.status(204).end();
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

router.get("/admin/orders", async (req, res) => {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid pagination params" });
    return;
  }
  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const [[totalRow], rows] = await Promise.all([
    db.select({ count: count() }).from(ordersTable),
    db
      .select({
        ...getTableColumns(ordersTable),
        customerName: usersTable.name,
        customerPhone: usersTable.phone,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .orderBy(desc(ordersTable.createdAt))
      .offset(offset)
      .limit(limit),
  ]);

  res.json({
    data: rows,
    total: totalRow?.count ?? 0,
    page,
    limit,
  });
});

router.get("/admin/orders/active", async (_req, res) => {
  const rows = await db
    .select({
      ...getTableColumns(ordersTable),
      customerName: usersTable.name,
      customerPhone: usersTable.phone,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .where(
      sql`${ordersTable.status} IN ('searching', 'accepted', 'picked_up', 'on_way')`,
    )
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);
  res.json(rows);
});

const STATUS_PUSH_MESSAGES: Record<string, string> = {
  accepted: "قبل مندوب طلبك وهو في الطريق لاستلامه!",
  picked_up: "المندوب استلم طلبك من المطعم 📦",
  on_way: "المندوب في الطريق إليك الآن 🛵",
  delivered: "تم التوصيل بنجاح 🎉 بالعافية!",
  cancelled: "تم إلغاء طلبك",
};

router.patch("/admin/orders/:id/status", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = z
    .object({ status: z.enum(ORDER_STATUSES) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [row] = await db
    .update(ordersTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  notifyOrderUpdate(row.userId, row);

  const pushMsg = STATUS_PUSH_MESSAGES[parsed.data.status];
  if (pushMsg) {
    await sendOrderPush(row.userId, pushMsg);
  }

  res.json(row);
});

router.get("/admin/users", async (_req, res) => {
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  res.json(rows);
});

router.patch("/admin/users/:id/role", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = z
    .object({ role: z.enum(["customer", "courier"]) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const [row] = await db
    .update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.get("/admin/ratings", async (req, res) => {
  const limitRaw = parseInt(String(req.query["limit"] ?? "50"));
  const limit = Math.min(Math.max(limitRaw, 1), 200);
  const offsetRaw = parseInt(String(req.query["offset"] ?? "0"));
  const offset = Math.max(offsetRaw, 0);

  const rows = await db
    .select({
      ...getTableColumns(orderRatingsTable),
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(orderRatingsTable)
    .leftJoin(usersTable, eq(orderRatingsTable.userId, usersTable.id))
    .orderBy(desc(orderRatingsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totals] = await db
    .select({
      total: count(),
      avgRestaurant: avg(orderRatingsTable.restaurantStars),
      avgCourier: avg(orderRatingsTable.courierStars),
    })
    .from(orderRatingsTable);

  res.json({
    ratings: rows,
    total: totals?.total ?? 0,
    avgRestaurantStars: totals?.avgRestaurant ? Number(Number(totals.avgRestaurant).toFixed(1)) : null,
    avgCourierStars: totals?.avgCourier ? Number(Number(totals.avgCourier).toFixed(1)) : null,
  });
});

export default router;
