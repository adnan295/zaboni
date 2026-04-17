import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  restaurantsTable,
  menuItemsTable,
  ordersTable,
  usersTable,
  orderRatingsTable,
  promoCodesTable,
  promoUsesTable,
  restaurantHoursTable,
  deliveryZonesTable,
  courierSubscriptionsTable,
  systemSettingsTable,
  courierWalletTransactionsTable,
  courierApplicationsTable,
  promoBannersTable,
  restaurantCategoriesTable,
  chatMessagesTable,
  orderStatusHistoryTable,
} from "@workspace/db";
import { eq, count, desc, gte, lte, getTableColumns, and, sql, avg, asc, lt } from "drizzle-orm";
import { notifyOrderUpdate, sendOrderPush } from "../orders/server";
import { sendSmsViaGateway, isSmsGatewayConfigured } from "../lib/sms";
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
      u.avatar_url AS "avatarUrl",
      u.created_at AS "createdAt",
      COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS "deliveredCount",
      COUNT(o.id) FILTER (WHERE o.status <> 'searching') AS "totalAssigned",
      ROUND(CAST(AVG(NULLIF(o.courier_rating, 0)) AS numeric), 1) AS "avgRating",
      MAX(o.updated_at) AS "lastDelivery"
    FROM users u
    LEFT JOIN orders o ON o.courier_id = u.id
    WHERE u.role = 'courier'
    GROUP BY u.id, u.name, u.phone, u.avatar_url, u.created_at
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

router.get("/admin/couriers/locations", async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      u.phone,
      u.is_online AS "isOnline",
      u.courier_lat AS lat,
      u.courier_lon AS lon,
      u.courier_location_updated_at AS "locationUpdatedAt",
      COUNT(o.id) FILTER (WHERE o.status = 'delivered' AND o.updated_at >= ${todayStart}) AS "todayDeliveries",
      (
        SELECT json_build_object(
          'id', ao.id,
          'status', ao.status,
          'orderText', ao.order_text,
          'restaurantName', ao.restaurant_name,
          'address', ao.address,
          'customerName', cu.name
        )
        FROM orders ao
        LEFT JOIN users cu ON cu.id = ao.user_id
        WHERE ao.courier_id = u.id
          AND ao.status IN ('accepted', 'picked_up', 'on_way')
        ORDER BY ao.updated_at DESC
        LIMIT 1
      ) AS "currentOrder"
    FROM users u
    LEFT JOIN orders o ON o.courier_id = u.id
    WHERE u.role = 'courier'
      AND u.courier_lat IS NOT NULL
      AND u.courier_lon IS NOT NULL
    GROUP BY u.id, u.name, u.phone, u.is_online, u.courier_lat, u.courier_lon, u.courier_location_updated_at
    ORDER BY u.is_online DESC, u.courier_location_updated_at DESC NULLS LAST
  `);

  res.json(
    rows.rows.map((r: Record<string, unknown>) => ({
      ...r,
      lat: r["lat"] != null ? Number(r["lat"]) : null,
      lon: r["lon"] != null ? Number(r["lon"]) : null,
      todayDeliveries: Number(r["todayDeliveries"] ?? 0),
    })),
  );
});

router.get("/admin/orders/active/locations", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      o.id,
      o.status,
      o.order_text AS "orderText",
      o.restaurant_name AS "restaurantName",
      o.address,
      o.destination_lat AS "destinationLat",
      o.destination_lon AS "destinationLon",
      o.updated_at AS "updatedAt",
      cu.name AS "customerName",
      cu.phone AS "customerPhone",
      co.name AS "courierName",
      co.phone AS "courierPhone",
      r.lat AS "restaurantLat",
      r.lon AS "restaurantLon"
    FROM orders o
    LEFT JOIN users cu ON cu.id = o.user_id
    LEFT JOIN users co ON co.id = o.courier_id
    LEFT JOIN restaurants r
      ON r.name_ar = o.restaurant_name OR r.name = o.restaurant_name
    WHERE o.status IN ('searching', 'accepted', 'picked_up', 'on_way')
    ORDER BY o.updated_at DESC
  `);

  res.json(
    rows.rows.map((r: Record<string, unknown>) => ({
      ...r,
      destinationLat: r["destinationLat"] != null ? Number(r["destinationLat"]) : null,
      destinationLon: r["destinationLon"] != null ? Number(r["destinationLon"]) : null,
      restaurantLat: r["restaurantLat"] != null ? Number(r["restaurantLat"]) : null,
      restaurantLon: r["restaurantLon"] != null ? Number(r["restaurantLon"]) : null,
    })),
  );
});

// ─── Chat Monitor endpoints ───────────────────────────────────────────────

router.get("/admin/chats", async (req, res) => {
  const search = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";

  const rows = await db.execute(sql`
    SELECT
      o.id AS "orderId",
      o.order_text AS "orderText",
      o.status,
      o.created_at AS "orderCreatedAt",
      cu.name AS "customerName",
      cu.phone AS "customerPhone",
      co.name AS "courierName",
      co.phone AS "courierPhone",
      COUNT(m.id)::int AS "messageCount",
      MAX(m.created_at) AS "lastMessageAt",
      (
        SELECT m2.text FROM chat_messages m2
        WHERE m2.order_id = o.id
        ORDER BY m2.created_at DESC
        LIMIT 1
      ) AS "lastMessageText"
    FROM orders o
    INNER JOIN chat_messages m ON m.order_id = o.id
    LEFT JOIN users cu ON cu.id = o.user_id
    LEFT JOIN users co ON co.id = o.courier_id
    ${
      search
        ? sql`WHERE (cu.name ILIKE ${"%" + search + "%"} OR cu.phone ILIKE ${"%" + search + "%"} OR co.name ILIKE ${"%" + search + "%"} OR co.phone ILIKE ${"%" + search + "%"} OR CAST(o.id AS text) ILIKE ${"%" + search + "%"})`
        : sql``
    }
    GROUP BY o.id, o.order_text, o.status, o.created_at, cu.name, cu.phone, co.name, co.phone
    ORDER BY MAX(m.created_at) DESC
  `);

  res.json(rows.rows);
});

router.get("/admin/chats/:orderId", async (req, res) => {
  const orderId = String(req.params["orderId"]);

  const [[order], messages] = await Promise.all([
    db
      .select({
        id: ordersTable.id,
        orderText: ordersTable.orderText,
        status: ordersTable.status,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1),
    db
      .select({
        id: chatMessagesTable.id,
        senderId: chatMessagesTable.senderId,
        senderRole: chatMessagesTable.senderRole,
        text: chatMessagesTable.text,
        createdAt: chatMessagesTable.createdAt,
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.orderId, orderId))
      .orderBy(asc(chatMessagesTable.createdAt)),
  ]);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json({ order, messages });
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
      avgCourierRating: sql<number | null>`(
        SELECT ROUND(CAST(AVG(NULLIF(courier_rating, 0)) AS numeric), 1)
        FROM ${ordersTable}
        WHERE (${ordersTable.restaurantName} = ${restaurantsTable.nameAr}
           OR ${ordersTable.restaurantName} = ${restaurantsTable.name})
          AND courier_rating > 0
      )`.as("avg_courier_rating"),
    })
    .from(restaurantsTable)
    .orderBy(restaurantsTable.name);
  res.json(rows.map((r) => ({
    ...r,
    avgCourierRating: r.avgCourierRating != null ? Number(r.avgCourierRating) : null,
  })));
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
  image: z.string().default(""),
  tags: z.array(z.string()).default([]),
  isOpen: z.boolean().default(true),
  discount: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
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
  image: z.string().default(""),
  category: z.string().default(""),
  categoryAr: z.string().default(""),
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

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
const isoDateSchema = z.string().regex(isoDateRe, "Expected YYYY-MM-DD").optional();

const ordersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  dateFrom: isoDateSchema,
  dateTo: isoDateSchema,
});

router.get("/admin/orders", async (req, res) => {
  const parsed = ordersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { page, limit, dateFrom, dateTo } = parsed.data;
  const offset = (page - 1) * limit;

  // Damascus is UTC+3; convert YYYY-MM-DD boundaries to UTC
  const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000;
  const conditions = [];
  if (dateFrom) {
    // Start of day in Damascus = dateFrom 00:00:00 local → subtract offset for UTC
    const from = new Date(Date.parse(dateFrom + "T00:00:00.000Z") - DAMASCUS_OFFSET_MS);
    if (!isNaN(from.getTime())) conditions.push(gte(ordersTable.createdAt, from));
  }
  if (dateTo) {
    // End of day in Damascus = dateTo 23:59:59.999 local → subtract offset for UTC
    const to = new Date(Date.parse(dateTo + "T23:59:59.999Z") - DAMASCUS_OFFSET_MS);
    if (!isNaN(to.getTime())) conditions.push(lte(ordersTable.createdAt, to));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [[totalRow], rows] = await Promise.all([
    db.select({ count: count() }).from(ordersTable).where(where),
    db
      .select({
        ...getTableColumns(ordersTable),
        customerName: usersTable.name,
        customerPhone: usersTable.phone,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
      .where(where)
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

  const cancelNote = parsed.data.status === "cancelled" ? "admin_cancelled" : null;
  if (cancelNote) {
    await db.insert(orderStatusHistoryTable).values({
      id: `${id}_admin_cancelled_${Date.now()}`,
      orderId: id,
      status: "cancelled",
      note: cancelNote,
    });
  }
  notifyOrderUpdate(row.userId, cancelNote ? { ...row, cancelNote } : row);

  const pushMsg = STATUS_PUSH_MESSAGES[parsed.data.status];
  if (pushMsg) {
    await sendOrderPush(row.userId, pushMsg, id);
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
  if (parsed.data.role === "courier") {
    res.status(410).json({
      error: "Granting courier role directly is disabled. Use courier applications to approve join requests.",
    });
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

  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.order_id AS "orderId",
      r.user_id AS "userId",
      r.courier_id AS "courierId",
      r.restaurant_id AS "restaurantId",
      r.restaurant_stars AS "restaurantStars",
      r.courier_stars AS "courierStars",
      r.comment,
      r.restaurant_name AS "restaurantName",
      r.created_at AS "createdAt",
      cu.name AS "userName",
      cu.phone AS "userPhone",
      cou.name AS "courierName",
      cou.phone AS "courierPhone"
    FROM order_ratings r
    LEFT JOIN users cu ON r.user_id = cu.id
    LEFT JOIN users cou ON r.courier_id = cou.id
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const [totals] = await db
    .select({
      total: count(),
      avgRestaurant: avg(orderRatingsTable.restaurantStars),
      avgCourier: avg(orderRatingsTable.courierStars),
    })
    .from(orderRatingsTable);

  res.json({
    ratings: rows.rows,
    total: totals?.total ?? 0,
    avgRestaurantStars: totals?.avgRestaurant ? Number(Number(totals.avgRestaurant).toFixed(1)) : null,
    avgCourierStars: totals?.avgCourier ? Number(Number(totals.avgCourier).toFixed(1)) : null,
  });
});

const promoBodySchema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

router.get("/admin/promos", async (_req, res) => {
  const promos = await db
    .select({
      ...getTableColumns(promoCodesTable),
      usesCount: sql<number>`(SELECT COUNT(*) FROM promo_uses WHERE promo_id = ${promoCodesTable.id})`,
    })
    .from(promoCodesTable)
    .orderBy(desc(promoCodesTable.createdAt));
  res.json(promos.map((p) => ({ ...p, usesCount: Number(p.usesCount) })));
});

router.post("/admin/promos", async (req, res) => {
  const parsed = promoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db
    .select({ id: promoCodesTable.id })
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, parsed.data.code))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Promo code already exists" });
    return;
  }
  const id = `promo_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(promoCodesTable)
    .values({
      id,
      code: parsed.data.code,
      type: parsed.data.type,
      value: parsed.data.value,
      maxUses: parsed.data.maxUses ?? null,
      maxUsesPerUser: parsed.data.maxUsesPerUser,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      isActive: parsed.data.isActive,
    })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/promos/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = promoBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.expiresAt !== undefined) {
    update["expiresAt"] = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  }
  const [row] = await db
    .update(promoCodesTable)
    .set(update)
    .where(eq(promoCodesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Promo not found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/promos/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(promoUsesTable).where(eq(promoUsesTable.promoId, id));
  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id));
  res.status(204).end();
});

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function buildDefaultHours(restaurantId: string) {
  return DAYS.map((_, i) => ({
    id: `rh_${restaurantId}_${i}`,
    restaurantId,
    dayOfWeek: i,
    openTime: "09:00",
    closeTime: "22:00",
    isClosed: false,
  }));
}

router.get("/admin/restaurants/:id/hours", async (req, res) => {
  const id = String(req.params["id"]);
  const rows = await db
    .select()
    .from(restaurantHoursTable)
    .where(eq(restaurantHoursTable.restaurantId, id))
    .orderBy(restaurantHoursTable.dayOfWeek);

  if (rows.length === 0) {
    res.json(buildDefaultHours(id));
    return;
  }
  res.json(rows);
});

const hoursBodySchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform((t) => t.slice(0, 5)),
    closeTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform((t) => t.slice(0, 5)),
    isClosed: z.boolean(),
  })
).length(7).refine(
  (arr) => {
    const days = arr.map((h) => h.dayOfWeek).sort((a, b) => a - b);
    return days.every((d, i) => d === i);
  },
  { message: "Must include exactly one entry for each day of week (0-6)" }
);

router.put("/admin/restaurants/:id/hours", async (req, res) => {
  const restaurantId = String(req.params["id"]);
  const parsed = hoursBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.delete(restaurantHoursTable).where(eq(restaurantHoursTable.restaurantId, restaurantId));

  const rows = parsed.data.map((h) => ({
    id: `rh_${restaurantId}_${h.dayOfWeek}`,
    restaurantId,
    dayOfWeek: h.dayOfWeek,
    openTime: h.openTime,
    closeTime: h.closeTime,
    isClosed: h.isClosed,
  }));

  await db.insert(restaurantHoursTable).values(rows);

  const nowDamascus = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Damascus" }));
  const dayOfWeek = nowDamascus.getDay();
  const todayHours = rows.find((r) => r.dayOfWeek === dayOfWeek);
  const isOpen = computeIsOpen(todayHours ?? null, nowDamascus);
  await db.update(restaurantsTable).set({ isOpen }).where(eq(restaurantsTable.id, restaurantId));

  res.json(rows);
});

function computeIsOpen(
  hours: { openTime: string; closeTime: string; isClosed: boolean } | null,
  nowDamascus: Date
): boolean {
  if (!hours || hours.isClosed) return false;
  const [oh, om] = hours.openTime.split(":").map(Number) as [number, number];
  const [ch, cm] = hours.closeTime.split(":").map(Number) as [number, number];
  const nowMinutes = nowDamascus.getHours() * 60 + nowDamascus.getMinutes();
  const openMinutes = oh * 60 + (om ?? 0);
  const closeMinutes = ch * 60 + (cm ?? 0);
  if (openMinutes <= closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

router.get("/admin/financial", async (req, res) => {
  const daysRaw = parseInt(String(req.query["days"] ?? "30"));
  const days = [7, 14, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const groupBy = req.query["groupBy"] === "week" ? "week" : "day";

  const revenueSeriesQuery =
    groupBy === "week"
      ? db.execute(sql`
          WITH week_series AS (
            SELECT generate_series(0, CEIL(${days}::numeric / 7)::int - 1) AS week_offset
          ),
          weekly AS (
            SELECT
              DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Damascus')::date AS week_start,
              COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::numeric AS revenue,
              COUNT(*) FILTER (WHERE status = 'delivered')::int AS orders
            FROM orders
            WHERE created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)
            GROUP BY DATE_TRUNC('week', created_at AT TIME ZONE 'Asia/Damascus')
          )
          SELECT
            TO_CHAR(ws.week_start, 'YYYY-MM-DD') AS date,
            COALESCE(w.revenue, 0)::numeric AS revenue,
            COALESCE(w.orders, 0)::int AS orders
          FROM (
            SELECT (DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Damascus') - (week_offset * '1 week'::interval))::date AS week_start
            FROM week_series
          ) ws
          LEFT JOIN weekly w ON w.week_start = ws.week_start
          ORDER BY ws.week_start
        `)
      : db.execute(sql`
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
          daily AS (
            SELECT
              TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'Asia/Damascus'), 'YYYY-MM-DD') AS date,
              COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::numeric AS revenue,
              COUNT(*) FILTER (WHERE status = 'delivered')::int AS orders
            FROM orders
            WHERE created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)
            GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'Asia/Damascus')
          )
          SELECT d.date, COALESCE(dl.revenue, 0)::numeric AS revenue, COALESCE(dl.orders, 0)::int AS orders
          FROM date_series d
          LEFT JOIN daily dl ON dl.date = d.date
          ORDER BY d.date
        `);

  const [totalRow, byRestaurant, revenueSeriesResult, subscriptionRow] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS "totalOrders",
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS "deliveredOrders",
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledOrders",
        COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::numeric AS "totalDeliveryFees"
      FROM orders
      WHERE created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)
    `),
    db.execute(sql`
      SELECT
        restaurant_name AS "restaurantName",
        COUNT(*)::int AS "totalOrders",
        COUNT(*) FILTER (WHERE status = 'delivered')::int AS "deliveredOrders",
        COALESCE(SUM(delivery_fee) FILTER (WHERE status = 'delivered'), 0)::numeric AS "revenue"
      FROM orders
      WHERE created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)
      GROUP BY restaurant_name
      ORDER BY "revenue" DESC
      LIMIT 20
    `),
    revenueSeriesQuery,
    db.execute(sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS "subscriptionRevenue",
        COUNT(*) FILTER (WHERE status = 'paid')::int AS "paidCount",
        COUNT(*) FILTER (WHERE status = 'waived')::int AS "waivedCount",
        COUNT(*) FILTER (WHERE status = 'pending')::int AS "pendingCount",
        COUNT(DISTINCT courier_id) AS "activeCouriers"
      FROM courier_subscriptions
      WHERE date >= (NOW() AT TIME ZONE 'Asia/Damascus' - CAST(${days} || ' days' AS INTERVAL))::date
    `),
  ]);

  const summary = totalRow.rows[0] as Record<string, unknown>;
  const subSummary = subscriptionRow.rows[0] as Record<string, unknown>;
  res.json({
    summary: {
      totalOrders: Number(summary["totalOrders"] ?? 0),
      deliveredOrders: Number(summary["deliveredOrders"] ?? 0),
      cancelledOrders: Number(summary["cancelledOrders"] ?? 0),
      totalDeliveryFees: Number(summary["totalDeliveryFees"] ?? 0),
      subscriptionRevenue: Number(subSummary["subscriptionRevenue"] ?? 0),
      paidSubscriptions: Number(subSummary["paidCount"] ?? 0),
      waivedSubscriptions: Number(subSummary["waivedCount"] ?? 0),
      pendingSubscriptions: Number(subSummary["pendingCount"] ?? 0),
    },
    byRestaurant: byRestaurant.rows.map((r: Record<string, unknown>) => ({
      restaurantName: r["restaurantName"],
      totalOrders: Number(r["totalOrders"] ?? 0),
      deliveredOrders: Number(r["deliveredOrders"] ?? 0),
      revenue: Number(r["revenue"] ?? 0),
    })),
    revenueSeries: revenueSeriesResult.rows.map((r: Record<string, unknown>) => ({
      date: r["date"],
      revenue: Number(r["revenue"] ?? 0),
      orders: Number(r["orders"] ?? 0),
    })),
    groupBy,
    days,
  });
});

const deliveryZoneBodySchema = z.object({
  label: z.string().max(100).nullable().optional(),
  fromKm: z.number().min(0),
  toKm: z.number().positive(),
  fee: z.number().int().min(0),
  isActive: z.boolean().default(true),
});

router.get("/admin/delivery-zones", async (_req, res) => {
  const rows = await db
    .select()
    .from(deliveryZonesTable)
    .orderBy(asc(deliveryZonesTable.fromKm));
  res.json(rows);
});

router.post("/admin/delivery-zones", async (req, res) => {
  const parsed = deliveryZoneBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.toKm <= parsed.data.fromKm) {
    res.status(400).json({ error: "toKm must be greater than fromKm" });
    return;
  }
  const id = `zone_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(deliveryZonesTable)
    .values({
      id,
      label: parsed.data.label ?? null,
      fromKm: parsed.data.fromKm,
      toKm: parsed.data.toKm,
      fee: parsed.data.fee,
      isActive: parsed.data.isActive,
    })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/delivery-zones/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = deliveryZoneBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.fromKm !== undefined && parsed.data.toKm !== undefined && parsed.data.toKm <= parsed.data.fromKm) {
    res.status(400).json({ error: "toKm must be greater than fromKm" });
    return;
  }
  const [row] = await db
    .update(deliveryZonesTable)
    .set(parsed.data)
    .where(eq(deliveryZonesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Zone not found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/delivery-zones/:id", async (req, res) => {
  const id = String(req.params["id"]);

  const existing = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "Zone not found" });
    return;
  }

  const allZones = await db
    .select()
    .from(deliveryZonesTable)
    .orderBy(asc(deliveryZonesTable.fromKm));

  if (allZones.length <= 1) {
    res.status(409).json({
      error: "لا يمكن حذف النطاق الوحيد — يجب أن يكون هناك نطاق واحد على الأقل لتحديد رسوم التوصيل",
    });
    return;
  }

  const remainingActiveZones = allZones
    .filter((z) => z.id !== id && z.isActive)
    .sort((a, b) => a.fromKm - b.fromKm);

  let coverageError = false;
  if (remainingActiveZones.length > 0) {
    if ((remainingActiveZones[0]?.fromKm ?? Infinity) > 0) {
      coverageError = true;
    } else {
      for (let i = 1; i < remainingActiveZones.length; i++) {
        if ((remainingActiveZones[i]?.fromKm ?? 0) > (remainingActiveZones[i - 1]?.toKm ?? 0)) {
          coverageError = true;
          break;
        }
      }
    }
  }

  if (coverageError) {
    res.status(409).json({
      error: "لا يمكن حذف هذا النطاق لأن ذلك سيخلق فجوة في تغطية النطاقات النشطة — عدّل النطاقات المجاورة أولاً",
    });
    return;
  }

  await db.delete(deliveryZonesTable).where(eq(deliveryZonesTable.id, id));
  res.status(204).end();
});

const DEFAULT_DAILY_SUBSCRIPTION_FEE = 5000;

async function getDailySubscriptionFee(): Promise<number> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "daily_subscription_fee"))
    .limit(1);
  if (rows.length === 0) return DEFAULT_DAILY_SUBSCRIPTION_FEE;
  return parseInt(rows[0]!.value, 10) || DEFAULT_DAILY_SUBSCRIPTION_FEE;
}

router.get("/admin/settings", async (_req, res) => {
  const rows = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  if (!("daily_subscription_fee" in map)) {
    map["daily_subscription_fee"] = String(DEFAULT_DAILY_SUBSCRIPTION_FEE);
  }
  res.json(map);
});

router.put("/admin/settings", async (req, res) => {
  const parsed = z.record(z.string(), z.string()).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings payload" });
    return;
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
  }
  res.json({ ok: true });
});

router.get("/admin/sms/status", async (_req, res) => {
  const jwtConfigured = !!(process.env["JWT_SECRET"]);
  const smsConfigured = await isSmsGatewayConfigured();
  const rows = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json({
    jwtConfigured,
    smsConfigured,
    smsMethod: map["sms_gateway_method"] ?? "POST",
    smsUrl: map["sms_gateway_url"] ? map["sms_gateway_url"].slice(0, 50) + (map["sms_gateway_url"].length > 50 ? "…" : "") : null,
  });
});

router.post("/admin/sms/test", async (req, res) => {
  const parsed = z.object({ phone: z.string().min(7) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "يجب تقديم رقم هاتف صالح" });
    return;
  }
  const { phone } = parsed.data;
  try {
    await sendSmsViaGateway(phone, `رسالة اختبار من زبوني — بوابة SMS تعمل بشكل صحيح ✓`);
    res.json({ ok: true, message: `تم إرسال رسالة اختبار إلى ${phone}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.get("/admin/subscriptions", async (req, res) => {
  const date = String(req.query["date"] ?? new Date().toISOString().slice(0, 10));
  const defaultFee = await getDailySubscriptionFee();

  const couriers = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.role, "courier"))
    .orderBy(usersTable.name);

  const subs = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(eq(courierSubscriptionsTable.date, date));

  const subMap = new Map(subs.map((s) => [s.courierId, s]));

  const result = couriers.map((c) => {
    const sub = subMap.get(c.id);
    return {
      courierId: c.id,
      name: c.name,
      phone: c.phone,
      date,
      subscriptionId: sub?.id ?? null,
      status: sub?.status ?? "pending",
      amount: sub?.amount ?? defaultFee,
      note: sub?.note ?? null,
    };
  });

  res.json({ date, defaultFee, couriers: result });
});

const subscriptionBodySchema = z.object({
  courierId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().int().min(0),
  status: z.enum(["paid", "waived", "pending"]),
  note: z.string().nullable().optional(),
});

router.post("/admin/subscriptions", async (req, res) => {
  const parsed = subscriptionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { courierId, date, amount, status, note } = parsed.data;

  const courierCheck = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, courierId), eq(usersTable.role, "courier")))
    .limit(1);
  if (courierCheck.length === 0) {
    res.status(400).json({ error: "Invalid courierId: not a courier" });
    return;
  }

  const existing = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(and(
      eq(courierSubscriptionsTable.courierId, courierId),
      eq(courierSubscriptionsTable.date, date),
    ))
    .limit(1);

  const tryDeductFromWallet = async (trx: Parameters<Parameters<(typeof db)["transaction"]>[0]>[0]): Promise<boolean> => {
    const [courierUser] = await trx
      .select({ walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, courierId))
      .limit(1);

    const balance = courierUser?.walletBalance ?? 0;
    if (balance < amount) return false;

    await trx
      .update(usersTable)
      .set({ walletBalance: sql`wallet_balance - ${amount}` })
      .where(eq(usersTable.id, courierId));

    const deductionId = `wded_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    await trx
      .insert(courierWalletTransactionsTable)
      .values({
        id: deductionId,
        courierId,
        amount: -amount,
        type: "subscription_deduction",
        status: "approved",
        note: `اشتراك ${date}`,
      });

    return true;
  };

  if (existing.length > 0) {
    const subId = existing[0]!.id;
    const existingStatus = existing[0]!.status;

    let savedRow;

    if (status === "paid" && existingStatus !== "paid") {
      let walletDeducted = false;
      await db.transaction(async (trx) => {
        walletDeducted = await tryDeductFromWallet(trx);
        const finalStatus = walletDeducted ? "paid" : "pending";
        await trx
          .update(courierSubscriptionsTable)
          .set({ amount, status: finalStatus, note: note ?? null })
          .where(eq(courierSubscriptionsTable.id, subId));
      });

      const [row] = await db.select().from(courierSubscriptionsTable).where(eq(courierSubscriptionsTable.id, subId)).limit(1);
      savedRow = row;
    } else {
      const [row] = await db
        .update(courierSubscriptionsTable)
        .set({ amount, status, note: note ?? null })
        .where(eq(courierSubscriptionsTable.id, subId))
        .returning();
      savedRow = row;
    }

    res.json(savedRow);
    return;
  }

  const id = `sub_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

  if (status === "paid") {
    let walletDeducted = false;
    await db.transaction(async (trx) => {
      walletDeducted = await tryDeductFromWallet(trx);
      const finalStatus = walletDeducted ? "paid" : "pending";
      await trx
        .insert(courierSubscriptionsTable)
        .values({ id, courierId, date, amount, status: finalStatus, note: note ?? null });
    });

    const [savedRow] = await db.select().from(courierSubscriptionsTable).where(eq(courierSubscriptionsTable.id, id)).limit(1);
    res.status(201).json(savedRow);
    return;
  }

  const [row] = await db
    .insert(courierSubscriptionsTable)
    .values({ id, courierId, date, amount, status, note: note ?? null })
    .returning();
  res.status(201).json(row);
});

router.get("/admin/subscriptions/history/:courierId", async (req, res) => {
  const courierId = String(req.params["courierId"]);
  const rows = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(eq(courierSubscriptionsTable.courierId, courierId))
    .orderBy(desc(courierSubscriptionsTable.date));
  res.json(rows);
});

router.get("/admin/subscriptions/report", async (req, res) => {
  const monthRaw = String(req.query["month"] ?? new Date().toISOString().slice(0, 7));
  const monthStart = `${monthRaw}-01`;
  const [year, month] = monthRaw.split("-").map(Number) as [number, number];
  const nextMonthDate = new Date(year, month, 1);
  const monthEnd = nextMonthDate.toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(and(
      gte(courierSubscriptionsTable.date, monthStart),
      lt(courierSubscriptionsTable.date, monthEnd),
    ));

  const paidRows = rows.filter((r) => r.status === "paid");
  const waivedRows = rows.filter((r) => r.status === "waived");
  const totalRevenue = paidRows.reduce((sum, r) => sum + r.amount, 0);
  const totalWaivedAmount = waivedRows.reduce((sum, r) => sum + r.amount, 0);

  res.json({
    month: monthRaw,
    totalPaid: paidRows.length,
    totalWaived: waivedRows.length,
    totalRevenue,
    totalWaivedAmount,
    entries: rows,
  });
});

router.get("/admin/wallet/deposit-requests", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      t.id,
      t.courier_id AS "courierId",
      u.name AS "courierName",
      u.phone AS "courierPhone",
      u.wallet_balance AS "walletBalance",
      t.amount,
      t.type,
      t.status,
      t.note,
      t.created_at AS "createdAt"
    FROM courier_wallet_transactions t
    JOIN users u ON u.id = t.courier_id
    WHERE t.status = 'pending'
      AND t.type = 'deposit_request'
    ORDER BY t.created_at ASC
  `);

  type WalletRow = {
    id: string;
    courierId: string;
    courierName: string;
    courierPhone: string;
    walletBalance: number;
    amount: number;
    type: string;
    status: string;
    note: string | null;
    createdAt: string | Date;
  };

  const data = (rows.rows as WalletRow[]).map((r) => ({
    id: r.id,
    courierId: r.courierId,
    courierName: r.courierName || "",
    courierPhone: r.courierPhone || "",
    walletBalance: Number(r.walletBalance),
    amount: Number(r.amount),
    type: r.type,
    status: r.status,
    note: r.note,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : (r.createdAt as Date).toISOString(),
  }));

  res.json(data);
});

router.post("/admin/wallet/deposit-requests/:id/approve", async (req, res) => {
  const id = String(req.params["id"]);

  let updatedBalance = 0;

  try {
    await db.transaction(async (trx) => {
      const updated = await trx
        .update(courierWalletTransactionsTable)
        .set({ status: "approved" })
        .where(and(
          eq(courierWalletTransactionsTable.id, id),
          eq(courierWalletTransactionsTable.status, "pending"),
        ))
        .returning();

      if (updated.length === 0) {
        throw new Error("NOT_FOUND");
      }

      const tx = updated[0]!;

      const approvedId = `wapp_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      await trx
        .insert(courierWalletTransactionsTable)
        .values({
          id: approvedId,
          courierId: tx.courierId,
          amount: tx.amount,
          type: "deposit_approved",
          status: "approved",
          note: tx.note,
        });

      const [userRow] = await trx
        .update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${tx.amount}` })
        .where(eq(usersTable.id, tx.courierId))
        .returning({ walletBalance: usersTable.walletBalance });

      updatedBalance = userRow?.walletBalance ?? 0;
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      res.status(404).json({ error: "Deposit request not found or already processed" });
      return;
    }
    throw e;
  }

  res.json({ ok: true, newBalance: updatedBalance });
});

router.post("/admin/wallet/deposit-requests/:id/reject", async (req, res) => {
  const id = String(req.params["id"]);

  const updated = await db
    .update(courierWalletTransactionsTable)
    .set({ status: "rejected" })
    .where(and(
      eq(courierWalletTransactionsTable.id, id),
      eq(courierWalletTransactionsTable.status, "pending"),
    ))
    .returning();

  if (updated.length === 0) {
    res.status(404).json({ error: "Deposit request not found or already processed" });
    return;
  }

  res.json({ ok: true });
});

router.get("/admin/courier-applications", requireAdmin, async (_req, res) => {
  const apps = await db
    .select({
      id: courierApplicationsTable.id,
      userId: courierApplicationsTable.userId,
      status: courierApplicationsTable.status,
      fullName: courierApplicationsTable.fullName,
      vehicleType: courierApplicationsTable.vehicleType,
      vehiclePlate: courierApplicationsTable.vehiclePlate,
      idNumber: courierApplicationsTable.idNumber,
      notes: courierApplicationsTable.notes,
      adminNote: courierApplicationsTable.adminNote,
      createdAt: courierApplicationsTable.createdAt,
      updatedAt: courierApplicationsTable.updatedAt,
      phone: usersTable.phone,
      userName: usersTable.name,
    })
    .from(courierApplicationsTable)
    .leftJoin(usersTable, eq(courierApplicationsTable.userId, usersTable.id))
    .orderBy(desc(courierApplicationsTable.createdAt));

  res.json(apps);
});

const rejectApplicationSchema = z.object({
  adminNote: z.string().default(""),
});

router.patch("/admin/courier-applications/:id/approve", requireAdmin, async (req, res) => {
  const id = String(req.params["id"]);

  const [app] = await db
    .select()
    .from(courierApplicationsTable)
    .where(eq(courierApplicationsTable.id, id))
    .limit(1);

  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  if (app.status !== "pending") {
    res.status(400).json({ error: "Application is not pending" });
    return;
  }

  await db.update(courierApplicationsTable)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(courierApplicationsTable.id, id));

  await db.update(usersTable)
    .set({ role: "courier" })
    .where(eq(usersTable.id, app.userId));

  res.json({ ok: true });
});

router.patch("/admin/courier-applications/:id/reject", requireAdmin, async (req, res) => {
  const id = String(req.params["id"]);

  const body = rejectApplicationSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const [app] = await db
    .select()
    .from(courierApplicationsTable)
    .where(eq(courierApplicationsTable.id, id))
    .limit(1);

  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  if (app.status !== "pending") {
    res.status(400).json({ error: "Application is not pending" });
    return;
  }

  await db.update(courierApplicationsTable)
    .set({ status: "rejected", adminNote: body.data.adminNote, updatedAt: new Date() })
    .where(eq(courierApplicationsTable.id, id));

  res.json({ ok: true });
});


const bannerBody = z.object({
  image: z.string().default(""),
  restaurantId: z.string().nullable().optional(),
  titleAr: z.string().default(""),
  titleEn: z.string().default(""),
  subtitleAr: z.string().default(""),
  subtitleEn: z.string().default(""),
  iconName: z.string().default("local-offer"),
  bgColor: z.string().default("#DC2626"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

router.get("/admin/banners", async (_req, res) => {
  const rows = await db.select().from(promoBannersTable).orderBy(asc(promoBannersTable.sortOrder));
  res.json(rows);
});

router.post("/admin/banners", async (req, res) => {
  const parsed = bannerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const id = `banner_${Date.now()}`;
  const [row] = await db.insert(promoBannersTable).values({ id, ...parsed.data }).returning();
  res.status(201).json(row);
});

router.patch("/admin/banners/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = bannerBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(promoBannersTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(promoBannersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/banners/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(promoBannersTable).where(eq(promoBannersTable.id, id));
  res.status(204).end();
});

const categoryBody = z.object({
  code: z.string().min(1).regex(/^[a-z0-9_]+$/, "Code must be lowercase alphanumeric with underscores only"),
  nameAr: z.string().min(1),
  nameEn: z.string().default(""),
  iconName: z.string().default("restaurant"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

router.get("/admin/categories", async (_req, res) => {
  const rows = await db.select().from(restaurantCategoriesTable).orderBy(asc(restaurantCategoriesTable.sortOrder));
  res.json(rows);
});

router.post("/admin/categories", async (req, res) => {
  const parsed = categoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const id = `cat_${Date.now()}`;
  const [row] = await db.insert(restaurantCategoriesTable).values({ id, ...parsed.data }).returning();
  res.status(201).json(row);
});

router.patch("/admin/categories/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = categoryBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(restaurantCategoriesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(restaurantCategoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/admin/categories/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(restaurantCategoriesTable).where(eq(restaurantCategoriesTable.id, id));
  res.status(204).end();
});

export default router;

