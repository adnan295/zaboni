import { Router, type Request, type Response } from "express";
import { whatsappManager } from "../lib/whatsapp";
import { db } from "@workspace/db";
import {
  restaurantsTable,
  menuItemsTable,
  ordersTable,
  usersTable,
  orderRatingsTable,
  promoCodesTable,
  promoTargetsTable,
  promoUsesTable,
  restaurantHoursTable,
  deliveryZonesTable,
  workZonesTable,
  courierSubscriptionsTable,
  courierSubscriptionPlansTable,
  systemSettingsTable,
  courierApplicationsTable,
  promoBannersTable,
  restaurantCategoriesTable,
  restaurantCategorySortOrdersTable,
  categoryRestaurantExclusionsTable,
  chatMessagesTable,
  orderStatusHistoryTable,
  homeSectionItemsTable,
  restaurantUsersTable,
  adminNotesTable,
  flashDealsTable,
  loyaltyTransactionsTable,
  userAchievementsTable,
  achievementsTable,
  customerSubscriptionsTable,
  referralsTable,
  referralCodesTable,
  customerWalletTransactionsTable,
  courierSubscriptionRequestsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { eq, count, sum, desc, gte, lte, getTableColumns, and, sql, avg, asc, lt, inArray } from "drizzle-orm";
import { notifyOrderUpdate, sendOrderPush } from "../orders/server";
import { sendPushToAllCustomers, isFlashDealImminent } from "../lib/push";
import { sendSmsViaGateway, isSmsGatewayConfigured } from "../lib/sms";
import { sendAdminAlertWebhook } from "../lib/waverifyMonitor";
import { z } from "zod";
import { requireAdmin, verifyAdminToken, setAdminPassword, hasAdminPassword } from "../middleware/adminAuth";

const ORDER_STATUSES = [
  "searching",
  "accepted",
  "picked_up",
  "on_way",
  "delivered",
  "cancelled",
] as const;

const router = Router();

router.get("/public/payment-info", async (_req, res) => {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(
      inArray(systemSettingsTable.key, ["payment_account_image", "payment_qr_image"])
    );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json({
    accountImage: map["payment_account_image"] ?? null,
    qrImage: map["payment_qr_image"] ?? null,
  });
});

router.use("/admin", requireAdmin);

// Whether a DB admin password has been set (vs. still using the bootstrap
// ADMIN_SECRET). Lets the UI nudge the operator to set a real password.
router.get("/admin/password-status", async (_req, res) => {
  res.json({ isSet: await hasAdminPassword() });
});

// Change the admin password. Requires the current password (defence in depth,
// on top of requireAdmin). The new password is bcrypt-hashed and stored in the
// DB, after which it fully replaces the previous credential.
router.post("/admin/change-password", async (req, res) => {
  const currentRaw = (req.body as { currentPassword?: unknown })?.currentPassword;
  const newRaw = (req.body as { newPassword?: unknown })?.newPassword;
  if (typeof currentRaw !== "string" || typeof newRaw !== "string") {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  // Trim both so the stored credential matches exactly what the login screen
  // sends (it trims too). Without this a trailing space would be hashed in on
  // change but stripped on login, so the new password would never work.
  const currentPassword = currentRaw.trim();
  const newPassword = newRaw.trim();
  if (newPassword.length < 8) {
    res.status(400).json({ error: "weak_password", message: "كلمة السر يجب أن تكون 8 أحرف على الأقل" });
    return;
  }
  const ok = await verifyAdminToken(currentPassword);
  if (!ok) {
    res.status(401).json({ error: "wrong_current_password", message: "كلمة السر الحالية غير صحيحة" });
    return;
  }
  await setAdminPassword(newPassword);
  res.json({ ok: true });
});

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
      u.zone_id AS "zoneId",
      u.created_at AS "createdAt",
      COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS "deliveredCount",
      COUNT(o.id) FILTER (WHERE o.status <> 'searching') AS "totalAssigned",
      ROUND(CAST(AVG(NULLIF(o.courier_rating, 0)) AS numeric), 1) AS "avgRating",
      MAX(o.updated_at) AS "lastDelivery"
    FROM users u
    LEFT JOIN orders o ON o.courier_id = u.id
    WHERE u.role = 'courier'
    GROUP BY u.id, u.name, u.phone, u.avatar_url, u.zone_id, u.created_at
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

router.patch("/admin/couriers/:id/zone", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = z.object({ zoneId: z.string().nullable() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(usersTable)
    .set({ zoneId: parsed.data.zoneId })
    .where(eq(usersTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Courier not found" });
    return;
  }
  res.json({ ok: true, zoneId: row.zoneId });
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
  isLogo: z.boolean().default(false),
  discount: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  zoneId: z.string().nullable().optional(),
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

router.get("/admin/restaurants/global-order", requireAdmin, async (req, res) => {
  const restaurants = await db
    .select({ id: restaurantsTable.id, nameAr: restaurantsTable.nameAr, name: restaurantsTable.name, image: restaurantsTable.image, sortOrder: restaurantsTable.sortOrder })
    .from(restaurantsTable);

  restaurants.sort((a, b) => {
    const aSo = a.sortOrder ?? null;
    const bSo = b.sortOrder ?? null;
    if (aSo !== null && bSo !== null) return aSo - bSo;
    if (aSo !== null) return -1;
    if (bSo !== null) return 1;
    return a.nameAr.localeCompare(b.nameAr, "ar");
  });

  res.json(restaurants);
});

router.put("/admin/restaurants/global-order", requireAdmin, async (req, res) => {
  const body = z.object({
    order: z.array(z.object({ restaurantId: z.string(), sortOrder: z.number().int() })),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { order } = body.data;
  if (order.length > 0) {
    await db.transaction(async (tx) => {
      for (const item of order) {
        await tx
          .update(restaurantsTable)
          .set({ sortOrder: item.sortOrder })
          .where(eq(restaurantsTable.id, item.restaurantId));
      }
    });
  }

  res.json({ ok: true });
});

router.get("/admin/restaurants/category-order", requireAdmin, async (req, res) => {
  const categoryId = typeof req.query["categoryId"] === "string" ? req.query["categoryId"].trim() : "";
  if (!categoryId) { res.status(400).json({ error: "categoryId required" }); return; }

  const [restaurants, catSortRows] = await Promise.all([
    db.select({ id: restaurantsTable.id, nameAr: restaurantsTable.nameAr, name: restaurantsTable.name, image: restaurantsTable.image, sortOrder: restaurantsTable.sortOrder })
      .from(restaurantsTable),
    db.select().from(restaurantCategorySortOrdersTable).where(eq(restaurantCategorySortOrdersTable.categoryId, categoryId)),
  ]);

  const sortMap = new Map<string, number>();
  for (const r of catSortRows) sortMap.set(r.restaurantId, r.sortOrder);

  const result = restaurants
    .map((r) => ({ ...r, categorySortOrder: sortMap.get(r.id) ?? null }))
    .sort((a, b) => {
      // 1. category-specific order (nulls last)
      const aS = a.categorySortOrder ?? null;
      const bS = b.categorySortOrder ?? null;
      if (aS !== null && bS !== null) return aS - bS;
      if (aS !== null) return -1;
      if (bS !== null) return 1;
      // 2. global sortOrder fallback (nulls last)
      const aSo = a.sortOrder ?? null;
      const bSo = b.sortOrder ?? null;
      if (aSo !== null && bSo !== null) return aSo - bSo;
      if (aSo !== null) return -1;
      if (bSo !== null) return 1;
      // 3. name alphabetical
      return a.nameAr.localeCompare(b.nameAr, "ar");
    });

  res.json(result);
});

router.put("/admin/restaurants/category-order", requireAdmin, async (req, res) => {
  const body = z.object({
    categoryId: z.string().min(1),
    order: z.array(z.object({ restaurantId: z.string(), sortOrder: z.number().int() })),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { categoryId, order } = body.data;
  if (order.length > 0) {
    await db.transaction(async (tx) => {
      for (const item of order) {
        const id = `cat_sort_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await tx
          .insert(restaurantCategorySortOrdersTable)
          .values({ id, restaurantId: item.restaurantId, categoryId, sortOrder: item.sortOrder })
          .onConflictDoUpdate({
            target: [restaurantCategorySortOrdersTable.restaurantId, restaurantCategorySortOrdersTable.categoryId],
            set: { sortOrder: item.sortOrder },
          });
      }
    });
  }

  res.json({ ok: true });
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

router.get("/admin/restaurant-performance", async (req, res) => {
  const daysRaw = parseInt(String(req.query["days"] ?? "7"));
  const days = [7, 30, 0].includes(daysRaw) ? daysRaw : 7;
  const orderTimeFilter = days > 0
    ? sql`AND o.created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)`
    : sql``;
  const ratingTimeFilter = days > 0
    ? sql`AND rt.created_at >= NOW() - CAST(${days} || ' days' AS INTERVAL)`
    : sql``;
  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.name_ar              AS "nameAr",
      r.name,
      r.image,
      COUNT(DISTINCT o.id)::int                                                           AS "totalOrders",
      COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled')::int                    AS "cancelledOrders",
      CASE WHEN COUNT(DISTINCT o.id) > 0
        THEN ROUND((COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled') * 100.0
              / COUNT(DISTINCT o.id))::numeric, 1)
        ELSE 0
      END                                                                                 AS "cancellationRate",
      ROUND(AVG(
        EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60
      ) FILTER (WHERE o.status = 'delivered')::numeric, 0)                               AS "avgDeliveryMinutes",
      ROUND(AVG(rt.restaurant_stars)::numeric, 1)                                        AS "avgRating",
      COUNT(DISTINCT rt.id)::int                                                          AS "ratingCount"
    FROM restaurants r
    LEFT JOIN orders o
      ON (o.restaurant_id = r.id OR o.restaurant_name = r.name_ar OR o.restaurant_name = r.name)
      ${orderTimeFilter}
    LEFT JOIN order_ratings rt
      ON (rt.restaurant_id = r.id OR rt.restaurant_name = r.name_ar OR rt.restaurant_name = r.name)
      ${ratingTimeFilter}
    GROUP BY r.id, r.name_ar, r.name, r.image
    ORDER BY COUNT(DISTINCT o.id) DESC, r.name_ar ASC
  `);
  res.json(rows.rows.map((r: Record<string, unknown>) => ({
    ...r,
    totalOrders: Number(r["totalOrders"] ?? 0),
    cancelledOrders: Number(r["cancelledOrders"] ?? 0),
    cancellationRate: Number(r["cancellationRate"] ?? 0),
    avgDeliveryMinutes: r["avgDeliveryMinutes"] != null ? Number(r["avgDeliveryMinutes"]) : null,
    avgRating: r["avgRating"] != null ? Number(r["avgRating"]) : null,
    ratingCount: Number(r["ratingCount"] ?? 0),
  })));
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
  description: z.string().nullish().transform((v) => v ?? ""),
  descriptionAr: z.string().nullish().transform((v) => v ?? ""),
  price: z.number().min(0),
  image: z.string().nullish().transform((v) => v ?? ""),
  category: z.string().nullish().transform((v) => v ?? ""),
  categoryAr: z.string().nullish().transform((v) => v ?? ""),
  subcategory: z.string().nullable().optional().transform((v) => v?.trim() || null),
  subcategoryAr: z.string().nullable().optional().transform((v) => v?.trim() || null),
  isPopular: z.boolean().default(false),
  isDeal: z.boolean().default(false),
  dealPrice: z.number().min(0).nullable().optional(),
  dealDiscountPercent: z.number().min(0).max(99).nullable().optional(),
  dealExpiresAt: z.string().nullable().optional().transform((v) => (v ? new Date(v) : null)),
});

const updateMenuItemBody = z.object({
  name: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),
  description: z.preprocess((v) => (v === null ? "" : v), z.string().optional()),
  descriptionAr: z.preprocess((v) => (v === null ? "" : v), z.string().optional()),
  price: z.number().min(0).optional(),
  image: z.preprocess((v) => (v === null ? "" : v), z.string().optional()),
  category: z.preprocess((v) => (v === null ? "" : v), z.string().optional()),
  categoryAr: z.preprocess((v) => (v === null ? "" : v), z.string().optional()),
  subcategory: z.preprocess(
    (v) => (v === undefined ? undefined : v),
    z.string().nullable().optional().transform((v) => (v == null ? null : v.trim() || null)),
  ),
  subcategoryAr: z.preprocess(
    (v) => (v === undefined ? undefined : v),
    z.string().nullable().optional().transform((v) => (v == null ? null : v.trim() || null)),
  ),
  isPopular: z.boolean().optional(),
  isDeal: z.boolean().optional(),
  dealPrice: z.number().min(0).nullable().optional(),
  dealDiscountPercent: z.number().min(0).max(99).nullable().optional(),
  dealExpiresAt: z.string().nullable().optional().transform((v) => (v ? new Date(v) : null)),
});

router.post("/admin/restaurants/:id/menu", async (req, res) => {
  const restaurantId = String(req.params["id"]);
  const parsed = menuItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = { ...parsed.data };
  // Derive dealPrice ↔ dealDiscountPercent when creating with a deal
  if (data.isDeal && (data.dealDiscountPercent != null || data.dealPrice != null)) {
    const basePrice = data.price;
    if (data.dealDiscountPercent != null && data.dealPrice == null) {
      data.dealPrice = Math.round(basePrice * (1 - data.dealDiscountPercent / 100));
    } else if (data.dealPrice != null && data.dealDiscountPercent == null) {
      data.dealDiscountPercent = Math.round((1 - data.dealPrice / basePrice) * 100);
    }
    if (data.dealPrice != null && data.dealPrice >= basePrice) {
      res.status(400).json({ error: "سعر العرض يجب أن يكون أقل من السعر الأصلي" });
      return;
    }
  }
  if (!data.isDeal) {
    data.dealPrice = null;
    data.dealDiscountPercent = null;
    data.dealExpiresAt = null;
  }
  const itemId = `item_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(menuItemsTable)
    .values({ id: itemId, restaurantId, ...data })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/restaurants/:restaurantId/menu/:itemId", async (req, res) => {
  const itemId = String(req.params["itemId"]);
  const restaurantId = String(req.params["restaurantId"]);
  const parsed = updateMenuItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  ) as Partial<typeof parsed.data>;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    // Derive dealPrice ↔ dealDiscountPercent when a deal is being activated
    if (updates.isDeal === true && (updates.dealDiscountPercent != null || updates.dealPrice != null)) {
      const [existing] = await db
        .select({ price: menuItemsTable.price })
        .from(menuItemsTable)
        .where(and(eq(menuItemsTable.id, itemId), eq(menuItemsTable.restaurantId, restaurantId)))
        .limit(1);
      if (existing) {
        const basePrice = (updates.price ?? existing.price);
        if (updates.dealDiscountPercent != null && updates.dealPrice == null) {
          updates.dealPrice = Math.round(basePrice * (1 - updates.dealDiscountPercent / 100));
        } else if (updates.dealPrice != null && updates.dealDiscountPercent == null) {
          updates.dealDiscountPercent = Math.round((1 - updates.dealPrice / basePrice) * 100);
        }
        if (updates.dealPrice != null && updates.dealPrice >= basePrice) {
          res.status(400).json({ error: "سعر العرض يجب أن يكون أقل من السعر الأصلي" });
          return;
        }
      }
    }
    if (updates.isDeal === false) {
      updates.dealPrice = null;
      updates.dealDiscountPercent = null;
      updates.dealExpiresAt = null;
    }
    const [row] = await db
      .update(menuItemsTable)
      .set(updates)
      .where(
        and(
          eq(menuItemsTable.id, itemId),
          eq(menuItemsTable.restaurantId, restaurantId),
        ),
      )
      .returning();
    if (!row) {
      req.log.error({ itemId, restaurantId }, "PUT menu item: not found");
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT menu item: DB error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Database error" });
  }
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
  orderId: z.string().optional(),
});

router.get("/admin/orders", async (req, res) => {
  const parsed = ordersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { page, limit, dateFrom, dateTo, orderId } = parsed.data;
  const offset = (page - 1) * limit;

  // Damascus is UTC+3; convert YYYY-MM-DD boundaries to UTC
  const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000;
  const conditions = [];
  if (orderId) {
    conditions.push(eq(ordersTable.id, orderId));
  }
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

router.get("/admin/sla-alerts", async (req, res) => {
  const minAgeMinutesRaw = parseInt(String(req.query["minAge"] ?? "5"));
  const minAgeMinutes = Number.isFinite(minAgeMinutesRaw) && minAgeMinutesRaw >= 1 ? minAgeMinutesRaw : 5;
  const cutoff = new Date(Date.now() - minAgeMinutes * 60_000);

  const rows = await db.execute(sql`
    SELECT
      o.id,
      o.order_text AS "orderText",
      o.restaurant_name AS "restaurantName",
      o.address,
      o.created_at AS "createdAt",
      EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60.0 AS "ageMinutes",
      u.name AS "customerName",
      u.phone AS "customerPhone"
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.status = 'searching'
      AND o.created_at < ${cutoff}
    ORDER BY o.created_at ASC
  `);

  res.json(
    rows.rows.map((r: Record<string, unknown>) => ({
      ...r,
      ageMinutes: Math.round(Number(r["ageMinutes"] ?? 0)),
    })),
  );
});

router.get("/admin/cancellation-stats", async (req, res) => {
  const daysRaw = parseInt(String(req.query["days"] ?? "30"));
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // 1. Reason breakdown — LATERAL LIMIT 1 ensures exactly one history row per order (no inflation)
  const reasonRows = await db.execute(sql`
    SELECT
      CASE
        WHEN osh.note = 'auto_expired' THEN 'auto_expired'
        WHEN o.courier_id = '' OR o.courier_id IS NULL THEN 'customer'
        ELSE 'restaurant_rejected'
      END AS reason,
      COUNT(*)::int AS count
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT note
      FROM order_status_history
      WHERE order_id = o.id AND status = 'cancelled'
      ORDER BY created_at DESC
      LIMIT 1
    ) osh ON true
    WHERE o.status = 'cancelled'
      AND o.created_at >= ${since}
    GROUP BY reason
  `);

  // 2. By hour (Damascus time)
  const hourRows = await db.execute(sql`
    WITH hour_series AS (SELECT generate_series(0, 23)::int AS hour)
    SELECT
      h.hour,
      COALESCE(c.count, 0)::int AS count
    FROM hour_series h
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Damascus')::int AS hour,
             COUNT(*)::int AS count
      FROM orders
      WHERE status = 'cancelled' AND created_at >= ${since}
      GROUP BY 1
    ) c ON c.hour = h.hour
    ORDER BY h.hour
  `);

  // 3. By delivery zone (Haversine from Damascus center 33.5138, 36.2765)
  const zoneRows = await db.execute(sql`
    SELECT
      COALESCE(dz.label, 'خارج النطاق') AS zone,
      COUNT(*)::int AS count
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT dz2.label
      FROM delivery_zones dz2
      WHERE dz2.is_active = true
        AND (
          6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS((COALESCE(o.destination_lat, 33.5138) - 33.5138) / 2)), 2) +
            COS(RADIANS(33.5138)) * COS(RADIANS(COALESCE(o.destination_lat, 33.5138))) *
            POWER(SIN(RADIANS((COALESCE(o.destination_lon, 36.2765) - 36.2765) / 2)), 2)
          ))
        ) BETWEEN dz2.from_km AND dz2.to_km
      ORDER BY dz2.from_km
      LIMIT 1
    ) dz ON true
    WHERE o.status = 'cancelled'
      AND o.created_at >= ${since}
    GROUP BY COALESCE(dz.label, 'خارج النطاق')
    ORDER BY count DESC
  `);

  // 4. Per-restaurant cancellation rates
  const restaurantRows = await db.execute(sql`
    SELECT
      restaurant_name AS "restaurantName",
      COUNT(*)::int AS "totalOrders",
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      ROUND(
        CAST(COUNT(*) FILTER (WHERE status = 'cancelled') AS numeric)
        / NULLIF(COUNT(*), 0) * 100,
        1
      ) AS rate
    FROM orders
    WHERE created_at >= ${since}
      AND restaurant_name <> ''
    GROUP BY restaurant_name
    HAVING COUNT(*) FILTER (WHERE status = 'cancelled') > 0
    ORDER BY rate DESC
    LIMIT 20
  `);

  // Summarise reason counts
  const reasonMap: Record<string, number> = {};
  for (const r of reasonRows.rows as { reason: string; count: number }[]) {
    reasonMap[r.reason] = Number(r.count);
  }
  const total = Object.values(reasonMap).reduce((s, v) => s + v, 0);

  res.json({
    days,
    total,
    byReason: {
      autoExpired: reasonMap["auto_expired"] ?? 0,
      customerInitiated: reasonMap["customer"] ?? 0,
      restaurantRejected: reasonMap["restaurant_rejected"] ?? 0,
    },
    byHour: (hourRows.rows as { hour: number; count: number }[]).map((r) => ({
      hour: Number(r.hour),
      count: Number(r.count),
    })),
    byZone: (zoneRows.rows as { zone: string; count: number }[]).map((r) => ({
      zone: r.zone,
      count: Number(r.count),
    })),
    byRestaurant: (restaurantRows.rows as { restaurantName: string; totalOrders: number; cancelled: number; rate: number }[]).map((r) => ({
      restaurantName: r.restaurantName,
      totalOrders: Number(r.totalOrders),
      cancelled: Number(r.cancelled),
      rate: Number(r.rate),
    })),
  });
});

// ─── Courier Performance ──────────────────────────────────────────────────

router.get("/admin/courier-performance", async (req, res) => {
  const daysRaw = parseInt(String(req.query["days"] ?? "7"));
  const days = [7, 30].includes(daysRaw) ? daysRaw : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Use separate CTEs for order stats and rating stats to avoid cross-join row inflation
  const rows = await db.execute(sql`
    WITH order_stats AS (
      SELECT
        courier_id,
        COUNT(*) FILTER (
          WHERE status = 'delivered' AND created_at >= ${since}
        )::int                                             AS deliveries,
        COUNT(*) FILTER (
          WHERE status = 'cancelled'
            AND courier_id IS NOT NULL
            AND courier_id <> ''
            AND created_at >= ${since}
        )::int                                             AS cancelled_after_assign,
        ROUND(
          CAST(AVG(
            CASE WHEN status = 'delivered' AND created_at >= ${since}
              THEN EXTRACT(EPOCH FROM (
                (SELECT h2.created_at FROM order_status_history h2
                 WHERE h2.order_id = o.id AND h2.status = 'delivered'
                 ORDER BY h2.created_at DESC LIMIT 1)
                -
                (SELECT h1.created_at FROM order_status_history h1
                 WHERE h1.order_id = o.id AND h1.status = 'accepted'
                 ORDER BY h1.created_at ASC LIMIT 1)
              )) / 60.0
            END
          ) AS numeric), 0
        )                                                  AS avg_delivery_minutes,
        MAX(updated_at)                                    AS last_order_at
      FROM orders o
      WHERE courier_id IS NOT NULL AND courier_id <> ''
      GROUP BY courier_id
    ),
    rating_stats AS (
      SELECT
        courier_id,
        ROUND(
          CAST(AVG(courier_stars) FILTER (WHERE courier_stars > 0) AS numeric), 1
        )                                                  AS avg_rating,
        COUNT(*) FILTER (WHERE courier_stars > 0)::int    AS rating_count
      FROM order_ratings
      GROUP BY courier_id
    )
    SELECT
      u.id,
      u.name,
      u.phone,
      u.avatar_url                                         AS "avatarUrl",
      u.is_online                                          AS "isOnline",
      GREATEST(u.courier_location_updated_at, os.last_order_at) AS "lastSeen",
      COALESCE(os.deliveries, 0)                           AS deliveries,
      COALESCE(os.cancelled_after_assign, 0)               AS "cancelledAfterAssign",
      rs.avg_rating                                        AS "avgRating",
      rs.rating_count                                      AS "ratingCount",
      os.avg_delivery_minutes                              AS "avgDeliveryMinutes"
    FROM users u
    LEFT JOIN order_stats  os ON os.courier_id = u.id
    LEFT JOIN rating_stats rs ON rs.courier_id = u.id
    WHERE u.role = 'courier'
    ORDER BY deliveries DESC
  `);

  res.json(
    rows.rows.map((r: Record<string, unknown>) => {
      const deliveries = Number(r["deliveries"] ?? 0);
      const cancelledAfterAssign = Number(r["cancelledAfterAssign"] ?? 0);
      // Acceptance rate: orders completed vs. (completed + cancelled after courier was assigned).
      // No explicit "rejected" action exists in schema; cancelled-after-assign is the best proxy.
      const totalAssigned = deliveries + cancelledAfterAssign;
      return {
        id: r["id"],
        name: r["name"],
        phone: r["phone"],
        avatarUrl: r["avatarUrl"],
        isOnline: r["isOnline"],
        lastSeen: r["lastSeen"],
        deliveries,
        cancelledAfterAssign,
        totalAssigned,
        acceptanceRate: totalAssigned > 0 ? Math.round((deliveries / totalAssigned) * 100) : null,
        avgRating: r["avgRating"] != null ? Number(r["avgRating"]) : null,
        ratingCount: r["ratingCount"] != null ? Number(r["ratingCount"]) : 0,
        avgDeliveryMinutes: r["avgDeliveryMinutes"] != null ? Number(r["avgDeliveryMinutes"]) : null,
      };
    }),
  );
});

router.get("/admin/courier-performance/:courierId", async (req, res) => {
  const courierId = String(req.params["courierId"]);
  const daysRaw = parseInt(String(req.query["days"] ?? "7"));
  const days = [7, 30].includes(daysRaw) ? daysRaw : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Verify courier exists
  const [courier] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.id, courierId), eq(usersTable.role, "courier")))
    .limit(1);

  if (!courier) {
    res.status(404).json({ error: "Courier not found" });
    return;
  }

  const [dailyRows, recentOrders, ratingHistory] = await Promise.all([
    db.execute(sql`
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
          COUNT(*)::int AS count
        FROM orders
        WHERE courier_id = ${courierId}
          AND status = 'delivered'
          AND created_at >= ${since}
        GROUP BY 1
      )
      SELECT d.date, COALESCE(c.count, 0)::int AS count
      FROM date_series d
      LEFT JOIN daily c ON c.date = d.date
      ORDER BY d.date
    `),
    db.execute(sql`
      SELECT
        o.id,
        o.status,
        o.restaurant_name AS "restaurantName",
        o.address,
        o.order_text      AS "orderText",
        o.delivery_fee    AS "deliveryFee",
        o.created_at      AS "createdAt",
        u.name            AS "customerName"
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.courier_id = ${courierId}
        AND o.created_at >= ${since}
      ORDER BY o.created_at DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT
        r.courier_stars   AS "stars",
        r.created_at      AS "ratedAt",
        u.name            AS "customerName",
        o.restaurant_name AS "restaurantName"
      FROM order_ratings r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.courier_id = ${courierId}
        AND r.courier_stars > 0
        AND r.created_at >= ${since}
      ORDER BY r.created_at DESC
      LIMIT 20
    `),
  ]);

  res.json({
    courierId,
    days,
    dailyDeliveries: (dailyRows.rows as { date: string; count: number }[]).map((r) => ({
      date: r.date,
      count: Number(r.count),
    })),
    recentOrders: (recentOrders.rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      deliveryFee: Number(r["deliveryFee"] ?? 0),
    })),
    ratingHistory: (ratingHistory.rows as Record<string, unknown>[]).map((r) => ({
      stars: Number(r["stars"]),
      ratedAt: r["ratedAt"],
      customerName: r["customerName"] ?? null,
      restaurantName: r["restaurantName"] ?? null,
    })),
  });
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
  const rows = await db.execute(sql`
    SELECT
      u.id,
      u.phone,
      u.name,
      u.role,
      u.avatar_url       AS "avatarUrl",
      u.created_at       AS "createdAt",
      u.loyalty_points   AS "loyaltyPoints",
      u.is_blocked       AS "isBlocked",
      COALESCE(oc.order_count, 0)::int AS "orderCount",
      oc.last_order_at   AS "lastOrderAt",
      CASE WHEN cs.user_id IS NOT NULL THEN true ELSE false END AS "isSubscribed"
    FROM users u
    LEFT JOIN (
      SELECT user_id,
             COUNT(*)::int          AS order_count,
             MAX(created_at)        AS last_order_at
      FROM orders
      GROUP BY user_id
    ) oc ON u.id = oc.user_id
    LEFT JOIN (
      SELECT DISTINCT user_id
      FROM customer_subscriptions
      WHERE is_active = true AND ends_at > NOW()
    ) cs ON u.id = cs.user_id
    ORDER BY u.created_at DESC
  `);
  res.json(rows.rows);
});

router.get("/admin/users/:id/detail", requireAdmin, async (req, res) => {
  const id = String(req.params["id"]);

  const [userRow] = await db
    .select({ loyaltyPoints: usersTable.loyaltyPoints })
    .from(usersTable)
    .where(eq(usersTable.id, id));

  if (!userRow) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [ordersResult, transactions, achievements, subscription] = await Promise.all([
    db.execute(sql`
      SELECT id,
             restaurant_name AS "restaurantName",
             status,
             created_at     AS "createdAt",
             total_price    AS "totalPrice",
             delivery_fee   AS "deliveryFee",
             order_text     AS "orderText"
      FROM orders
      WHERE user_id = ${id}
      ORDER BY created_at DESC
      LIMIT 10
    `),

    db
      .select()
      .from(loyaltyTransactionsTable)
      .where(eq(loyaltyTransactionsTable.userId, id))
      .orderBy(desc(loyaltyTransactionsTable.createdAt))
      .limit(10),

    db
      .select({
        achievementKey: userAchievementsTable.achievementKey,
        earnedAt: userAchievementsTable.earnedAt,
        titleAr: achievementsTable.titleAr,
        icon: achievementsTable.icon,
      })
      .from(userAchievementsTable)
      .leftJoin(achievementsTable, eq(userAchievementsTable.achievementKey, achievementsTable.key))
      .where(eq(userAchievementsTable.userId, id))
      .orderBy(desc(userAchievementsTable.earnedAt)),

    db
      .select()
      .from(customerSubscriptionsTable)
      .where(eq(customerSubscriptionsTable.userId, id))
      .orderBy(desc(customerSubscriptionsTable.endsAt))
      .limit(1),
  ]);

  res.json({
    currentPoints: userRow.loyaltyPoints,
    orders: ordersResult.rows,
    loyaltyTransactions: transactions,
    achievements,
    subscription: subscription[0] ?? null,
  });
});

router.post("/admin/users/:id/adjust-points", requireAdmin, async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = z
    .object({ delta: z.number().int(), note: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "delta (integer) and note (string) are required" });
    return;
  }
  const { delta, note } = parsed.data;

  const [userRow] = await db
    .select({ loyaltyPoints: usersTable.loyaltyPoints })
    .from(usersTable)
    .where(eq(usersTable.id, id));

  if (!userRow) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (delta < 0 && userRow.loyaltyPoints + delta < 0) {
    res.status(400).json({ error: "Insufficient points for deduction" });
    return;
  }

  const txId = `loy_admin_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

  await db.transaction(async (tx) => {
    await tx.insert(loyaltyTransactionsTable).values({
      id: txId,
      userId: id,
      type: "admin_adjust",
      points: delta,
      description: note,
    });
    await tx
      .update(usersTable)
      .set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} + ${delta}` })
      .where(eq(usersTable.id, id));
  });

  const [updated] = await db
    .select({ loyaltyPoints: usersTable.loyaltyPoints })
    .from(usersTable)
    .where(eq(usersTable.id, id));

  res.json({ ok: true, newPoints: updated?.loyaltyPoints ?? 0 });
});

router.patch("/admin/users/:id/block", requireAdmin, async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = z.object({ block: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "block (boolean) is required" });
    return;
  }

  const [row] = await db
    .update(usersTable)
    .set({ isBlocked: parsed.data.block })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, isBlocked: usersTable.isBlocked });

  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ ok: true, isBlocked: row.isBlocked });
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
  // --- discount engine ---
  appliesTo: z.enum(["delivery", "food", "order"]).default("delivery"),
  maxDiscount: z.number().int().nonnegative().nullable().optional(),
  minOrderValue: z.number().int().nonnegative().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  firstOrderOnly: z.boolean().default(false),
  audience: z.enum(["all", "specific", "new", "inactive"]).default("all"),
  inactiveDays: z.number().int().positive().nullable().optional(),
  autoApply: z.boolean().default(false),
  titleAr: z.string().max(120).default(""),
  // Phone numbers a "specific" promo is limited to (replaces the target list).
  targetPhones: z.array(z.string().min(3).max(20)).max(5000).optional(),
});

// Replace the phone list a "specific" promo targets. undefined = leave as-is
// (field not sent); an array (even empty) = set exactly to that list.
async function savePromoTargets(promoId: string, phones: string[] | undefined): Promise<void> {
  if (phones === undefined) return;
  await db.delete(promoTargetsTable).where(eq(promoTargetsTable.promoId, promoId));
  const clean = Array.from(new Set(phones.map((p) => p.trim()).filter(Boolean)));
  if (clean.length > 0) {
    await db.insert(promoTargetsTable).values(
      clean.map((phone, i) => ({
        id: `pt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        promoId,
        phone,
      })),
    );
  }
}

router.get("/admin/promos", async (_req, res) => {
  const promos = await db
    .select({
      ...getTableColumns(promoCodesTable),
      usesCount: sql<number>`(SELECT COUNT(*) FROM promo_uses WHERE promo_id = ${promoCodesTable.id})`,
      targetPhones: sql<string[]>`COALESCE((SELECT array_agg(phone) FROM promo_targets WHERE promo_id = ${promoCodesTable.id}), ARRAY[]::text[])`,
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
      appliesTo: parsed.data.appliesTo,
      maxDiscount: parsed.data.maxDiscount ?? null,
      minOrderValue: parsed.data.minOrderValue ?? null,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      firstOrderOnly: parsed.data.firstOrderOnly,
      audience: parsed.data.audience,
      inactiveDays: parsed.data.inactiveDays ?? null,
      autoApply: parsed.data.autoApply,
      titleAr: parsed.data.titleAr,
    })
    .returning();
  await savePromoTargets(id, parsed.data.targetPhones);
  res.status(201).json(row);
});

router.put("/admin/promos/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = promoBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { targetPhones, expiresAt, startsAt, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (expiresAt !== undefined) update["expiresAt"] = expiresAt ? new Date(expiresAt) : null;
  if (startsAt !== undefined) update["startsAt"] = startsAt ? new Date(startsAt) : null;
  const [row] = await db
    .update(promoCodesTable)
    .set(update)
    .where(eq(promoCodesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Promo not found" });
    return;
  }
  await savePromoTargets(id, targetPhones);
  res.json(row);
});

router.delete("/admin/promos/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(promoUsesTable).where(eq(promoUsesTable.promoId, id));
  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, id));
  res.status(204).end();
});

// Flash Deals CRUD
const flashDealBodySchema = z.object({
  restaurantId: z.string().min(1),
  title: z.string().min(1).max(200),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  maxUses: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

router.get("/admin/flash-deals", async (_req, res) => {
  const rows = await db
    .select({
      id: flashDealsTable.id,
      restaurantId: flashDealsTable.restaurantId,
      restaurantName: restaurantsTable.nameAr,
      title: flashDealsTable.title,
      discountType: flashDealsTable.discountType,
      discountValue: flashDealsTable.discountValue,
      startsAt: flashDealsTable.startsAt,
      endsAt: flashDealsTable.endsAt,
      maxUses: flashDealsTable.maxUses,
      usedCount: flashDealsTable.usedCount,
      isActive: flashDealsTable.isActive,
      createdAt: flashDealsTable.createdAt,
    })
    .from(flashDealsTable)
    .leftJoin(restaurantsTable, eq(restaurantsTable.id, flashDealsTable.restaurantId))
    .orderBy(desc(flashDealsTable.createdAt));
  res.json(rows);
});

router.post("/admin/flash-deals", async (req, res) => {
  const parsed = flashDealBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }); return; }
  const id = `fd_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const endsAtDate = new Date(parsed.data.endsAt);
  const [deal] = await db.insert(flashDealsTable).values({
    id,
    restaurantId: parsed.data.restaurantId,
    title: parsed.data.title,
    discountType: parsed.data.discountType,
    discountValue: parsed.data.discountValue,
    startsAt: new Date(parsed.data.startsAt),
    endsAt: endsAtDate,
    maxUses: parsed.data.maxUses ?? null,
    isActive: parsed.data.isActive,
  }).returning();
  res.status(201).json(deal);

  if (isFlashDealImminent(parsed.data.isActive, new Date(parsed.data.startsAt))) {
    void (async () => {
      try {
        const [restaurant] = await db
          .select({ nameAr: restaurantsTable.nameAr })
          .from(restaurantsTable)
          .where(eq(restaurantsTable.id, parsed.data.restaurantId))
          .limit(1);
        if (!restaurant) return;
        const discount = parsed.data.discountType === "percent"
          ? `${parsed.data.discountValue}%`
          : `${parsed.data.discountValue} ل.س`;
        const endTime = endsAtDate.toLocaleTimeString("ar-SY", { hour: "2-digit", minute: "2-digit", hour12: true });
        await sendPushToAllCustomers(
          `🔥 عرض فلاش: ${restaurant.nameAr}`,
          `خصم ${discount} على طلبك — ينتهي في ${endTime}`,
          { type: "flash_deal", restaurantId: parsed.data.restaurantId },
        );
      } catch (err) {
        req.log?.warn({ err }, "Failed to send flash deal push notification");
      }
    })();
  }
});

router.put("/admin/flash-deals/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = flashDealBodySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.startsAt !== undefined) updateData["startsAt"] = new Date(parsed.data.startsAt);
  if (parsed.data.endsAt !== undefined) updateData["endsAt"] = new Date(parsed.data.endsAt);
  const [updated] = await db.update(flashDealsTable).set(updateData).where(eq(flashDealsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "العرض غير موجود" }); return; }
  res.json(updated);
});

router.delete("/admin/flash-deals/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(flashDealsTable).where(eq(flashDealsTable.id, id));
  res.status(204).end();
});

router.get("/admin/flash-deals/:id/stats", async (req, res) => {
  const id = String(req.params["id"]);
  const [deal] = await db.select({ id: flashDealsTable.id, maxUses: flashDealsTable.maxUses, usedCount: flashDealsTable.usedCount })
    .from(flashDealsTable).where(eq(flashDealsTable.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "العرض غير موجود" }); return; }

  const [stats] = await db.select({
    ordersCount: count(),
    totalDiscount: sum(ordersTable.flashDealDiscount),
    totalRevenue: sum(ordersTable.totalPrice),
  }).from(ordersTable).where(eq(ordersTable.flashDealId, id));

  const ordersCount = Number(stats?.ordersCount ?? 0);
  const totalDiscount = Number(stats?.totalDiscount ?? 0);
  const totalRevenue = Number(stats?.totalRevenue ?? 0);
  const conversionRate = deal.maxUses ? Math.round((ordersCount / deal.maxUses) * 100) : null;
  res.json({ ordersCount, totalDiscount, totalRevenue, conversionRate });
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

const workZoneBodySchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().min(1),
  city: z.string().optional(),
  isActive: z.boolean().default(true),
});

router.get("/admin/work-zones", async (_req, res) => {
  const rows = await db
    .select()
    .from(workZonesTable)
    .orderBy(asc(workZonesTable.name));
  res.json(rows);
});

router.post("/admin/work-zones", async (req, res) => {
  const parsed = workZoneBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `wzone_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const [row] = await db
    .insert(workZonesTable)
    .values({
      id,
      name: parsed.data.name,
      nameAr: parsed.data.nameAr,
      city: parsed.data.city ?? "",
      isActive: parsed.data.isActive,
    })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/work-zones/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = workZoneBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(workZonesTable)
    .set(parsed.data)
    .where(eq(workZonesTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Zone not found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/work-zones/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const existing = await db
    .select()
    .from(workZonesTable)
    .where(eq(workZonesTable.id, id))
    .limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Zone not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ zoneId: null }).where(eq(usersTable.zoneId, id));
    await tx.update(restaurantsTable).set({ zoneId: null }).where(eq(restaurantsTable.zoneId, id));
    await tx.delete(workZonesTable).where(eq(workZonesTable.id, id));
  });
  res.status(204).end();
});

router.get("/admin/settings", async (_req, res) => {
  const rows = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
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

const HOME_FILTER_KEYS = ["rating", "time", "fee", "openNow"] as const;
const homeFiltersSchema = z.array(
  z.object({
    key: z.enum(HOME_FILTER_KEYS),
    labelAr: z.string().min(1).max(40),
    enabled: z.boolean(),
    order: z.number().int().min(0),
  })
).length(4);

router.put("/admin/settings/home-filters", requireAdmin, async (req, res) => {
  const parsed = homeFiltersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الفلاتر غير صحيحة" });
    return;
  }
  await db
    .insert(systemSettingsTable)
    .values({ key: "home_filters", value: JSON.stringify(parsed.data), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: JSON.stringify(parsed.data), updatedAt: new Date() },
    });
  res.json({ ok: true });
});

const TAB_TYPES = ["home", "favorites", "orders", "profile", "offers", "search", "errand"] as const;
const tabBarSchema = z
  .array(
    z.object({
      type: z.enum(TAB_TYPES),
      labelAr: z.string().min(1).max(30),
      order: z.number().int().min(0),
    })
  )
  .min(1)
  .refine((items) => items.some((i) => i.type === "home"), {
    message: "يجب وجود تبويب الرئيسية",
  })
  .refine((items) => new Set(items.map((i) => i.type)).size === items.length, {
    message: "لا يمكن إضافة نفس التبويب مرتين",
  });

router.put("/admin/settings/tab-bar", requireAdmin, async (req, res) => {
  const parsed = tabBarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
    return;
  }
  const ordered = parsed.data.map((item, i) => ({ ...item, order: i }));
  await db
    .insert(systemSettingsTable)
    .values({ key: "tab_bar_config", value: JSON.stringify(ordered), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: JSON.stringify(ordered), updatedAt: new Date() },
    });
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

router.post("/admin/webhook/test", async (req, res) => {
  const parsed = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "يجب تقديم رابط URL صالح" });
    return;
  }
  const { url } = parsed.data;
  const ok = await sendAdminAlertWebhook(url, `[مرسول] اختبار تنبيه — الويب هوك يعمل بشكل صحيح ✓`);
  if (ok) {
    res.json({ ok: true, message: "تم إرسال رسالة اختبار إلى الويب هوك بنجاح" });
  } else {
    res.status(502).json({ error: "فشل إرسال الطلب إلى الويب هوك — تحقق من الرابط وحاول مجدداً" });
  }
});

router.get("/admin/courier-subscription-plans", async (_req, res) => {
  const rows = await db
    .select()
    .from(courierSubscriptionPlansTable)
    .orderBy(courierSubscriptionPlansTable.sortOrder, courierSubscriptionPlansTable.price);
  res.json(rows);
});

const planCreateSchema = z.object({
  name: z.string().min(1).max(80),
  period: z.enum(["weekly", "monthly", "yearly"]),
  price: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

router.post("/admin/courier-subscription-plans", async (req, res) => {
  const body = planCreateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(courierSubscriptionPlansTable)
    .values({ id, ...body.data })
    .returning();
  res.status(201).json(row);
});

const planUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  period: z.enum(["weekly", "monthly", "yearly"]).optional(),
  price: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.put("/admin/courier-subscription-plans/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const body = planUpdateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: courierSubscriptionPlansTable.id })
    .from(courierSubscriptionPlansTable)
    .where(eq(courierSubscriptionPlansTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const [row] = await db
    .update(courierSubscriptionPlansTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(courierSubscriptionPlansTable.id, id))
    .returning();
  res.json(row);
});

router.delete("/admin/courier-subscription-plans/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const [existing] = await db
    .select({ id: courierSubscriptionPlansTable.id })
    .from(courierSubscriptionPlansTable)
    .where(eq(courierSubscriptionPlansTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await db.delete(courierSubscriptionPlansTable).where(eq(courierSubscriptionPlansTable.id, id));
  res.status(204).end();
});

router.get("/admin/courier-subscriptions", async (_req, res) => {
  const now = new Date();
  const couriers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      vehicleType: courierApplicationsTable.vehicleType,
    })
    .from(usersTable)
    .leftJoin(
      courierApplicationsTable,
      and(
        eq(courierApplicationsTable.userId, usersTable.id),
        eq(courierApplicationsTable.status, "approved"),
      ),
    )
    .where(eq(usersTable.role, "courier"))
    .orderBy(usersTable.name);

  const activeSubs = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(
      and(
        eq(courierSubscriptionsTable.isActive, true),
        sql`${courierSubscriptionsTable.endsAt} > NOW()`,
      ),
    );

  const subMap = new Map(activeSubs.map((s) => [s.courierId, s]));

  const result = couriers.map((c) => {
    const sub = subMap.get(c.id);
    const endsAt = sub?.endsAt ?? null;
    const daysLeft = endsAt
      ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000))
      : null;
    return {
      courierId: c.id,
      name: c.name,
      phone: c.phone,
      vehicleType: c.vehicleType ?? "motorcycle",
      subscriptionId: sub?.id ?? null,
      isActive: !!sub,
      status: sub?.status ?? "pending",
      planName: sub?.planName ?? null,
      planPeriod: sub?.planPeriod ?? null,
      amount: sub?.amount ?? 0,
      gifted: sub?.gifted ?? false,
      startsAt: sub?.startsAt ?? null,
      endsAt,
      daysLeft,
      note: sub?.note ?? null,
    };
  });

  res.json(result);
});

function addPeriodDuration(base: Date, period: "weekly" | "monthly" | "yearly"): Date {
  const end = new Date(base);
  if (period === "weekly") end.setDate(end.getDate() + 7);
  else if (period === "monthly") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}

const courierSubCreateSchema = z.object({
  courierId: z.string().min(1),
  planId: z.string().min(1),
  gifted: z.boolean().default(false),
  note: z.string().nullable().optional(),
});

router.post("/admin/courier-subscriptions", async (req, res) => {
  const parsed = courierSubCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { courierId, planId, gifted, note } = parsed.data;

  const courierCheck = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, courierId), eq(usersTable.role, "courier")))
    .limit(1);
  if (courierCheck.length === 0) {
    res.status(400).json({ error: "Invalid courierId: not a courier" });
    return;
  }

  const [plan] = await db
    .select()
    .from(courierSubscriptionPlansTable)
    .where(eq(courierSubscriptionPlansTable.id, planId))
    .limit(1);
  if (!plan) {
    res.status(400).json({ error: "Invalid planId" });
    return;
  }

  const now = new Date();
  const endsAt = addPeriodDuration(now, plan.period);
  const id = `csub_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

  await db
    .update(courierSubscriptionsTable)
    .set({ isActive: false })
    .where(and(
      eq(courierSubscriptionsTable.courierId, courierId),
      eq(courierSubscriptionsTable.isActive, true),
    ));

  const [row] = await db
    .insert(courierSubscriptionsTable)
    .values({
      id,
      courierId,
      planId: plan.id,
      planName: plan.name,
      planPeriod: plan.period,
      startsAt: now,
      endsAt,
      amount: gifted ? 0 : plan.price,
      status: gifted ? "waived" : "paid",
      isActive: true,
      gifted,
      createdByAdmin: true,
      note: note ?? null,
    })
    .returning();

  res.status(201).json(row);
});

router.patch("/admin/courier-subscriptions/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const body = z.object({
    days: z.number().int().min(1).max(400).optional(),
    note: z.string().nullable().optional(),
    status: z.enum(["paid", "waived", "pending"]).optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(eq(courierSubscriptionsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const updates: Partial<typeof courierSubscriptionsTable.$inferInsert> = {};
  if (body.data.note !== undefined) updates.note = body.data.note;
  if (body.data.status !== undefined) updates.status = body.data.status;

  if (body.data.days) {
    const base = existing.endsAt > new Date() ? existing.endsAt : new Date();
    const newEnd = new Date(base);
    newEnd.setDate(newEnd.getDate() + body.data.days);
    updates.endsAt = newEnd;
    updates.isActive = true;
  }

  const [row] = await db
    .update(courierSubscriptionsTable)
    .set(updates)
    .where(eq(courierSubscriptionsTable.id, id))
    .returning();

  res.json(row);
});

router.delete("/admin/courier-subscriptions/:id", async (req, res) => {
  const id = String(req.params["id"]);

  const [existing] = await db
    .select({ id: courierSubscriptionsTable.id })
    .from(courierSubscriptionsTable)
    .where(eq(courierSubscriptionsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await db
    .update(courierSubscriptionsTable)
    .set({ isActive: false })
    .where(eq(courierSubscriptionsTable.id, id));

  res.status(204).end();
});

router.get("/admin/subscriptions/history/:courierId", async (req, res) => {
  const courierId = String(req.params["courierId"]);
  const rows = await db
    .select()
    .from(courierSubscriptionsTable)
    .where(eq(courierSubscriptionsTable.courierId, courierId))
    .orderBy(desc(courierSubscriptionsTable.createdAt));
  res.json(rows);
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
      zoneId: usersTable.zoneId,
    })
    .from(courierApplicationsTable)
    .leftJoin(usersTable, eq(courierApplicationsTable.userId, usersTable.id))
    .orderBy(desc(courierApplicationsTable.createdAt));

  res.json(apps);
});

const rejectApplicationSchema = z.object({
  adminNote: z.string().default(""),
});

const approveApplicationSchema = z.object({
  zoneId: z.string().nullable().optional(),
});

router.patch("/admin/courier-applications/:id/approve", requireAdmin, async (req, res) => {
  const id = String(req.params["id"]);

  const body = approveApplicationSchema.safeParse(req.body ?? {});
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
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(courierApplicationsTable.id, id));

  await db.update(usersTable)
    .set({
      role: "courier",
      ...(body.data.zoneId !== undefined ? { zoneId: body.data.zoneId } : {}),
    })
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
  imageUrl: z.string().nullish(),
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

router.put("/admin/categories/reorder", async (req, res) => {
  const parsed = z.object({ order: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await Promise.all(
    parsed.data.order.map(({ id, sortOrder }) =>
      db.update(restaurantCategoriesTable).set({ sortOrder, updatedAt: new Date() }).where(eq(restaurantCategoriesTable.id, id))
    )
  );
  res.json({ ok: true });
});

// ─── Category Restaurant Exclusions ──────────────────────────────────────────

router.get("/admin/categories/:categoryId/exclusions", async (req, res) => {
  const categoryId = String(req.params["categoryId"]);
  const rows = await db
    .select({ restaurantId: categoryRestaurantExclusionsTable.restaurantId })
    .from(categoryRestaurantExclusionsTable)
    .where(eq(categoryRestaurantExclusionsTable.categoryId, categoryId));
  res.json(rows.map((r) => r.restaurantId));
});

router.post("/admin/categories/:categoryId/exclusions", async (req, res) => {
  const categoryId = String(req.params["categoryId"]);
  const { restaurantId } = req.body as { restaurantId?: string };
  if (!restaurantId) { res.status(400).json({ error: "restaurantId required" }); return; }
  const id = `excl_${categoryId}_${restaurantId}`;
  await db
    .insert(categoryRestaurantExclusionsTable)
    .values({ id, categoryId, restaurantId })
    .onConflictDoNothing();
  res.status(201).json({ ok: true });
});

router.delete("/admin/categories/:categoryId/exclusions/:restaurantId", async (req, res) => {
  const categoryId = String(req.params["categoryId"]);
  const restaurantId = String(req.params["restaurantId"]);
  await db
    .delete(categoryRestaurantExclusionsTable)
    .where(
      and(
        eq(categoryRestaurantExclusionsTable.categoryId, categoryId),
        eq(categoryRestaurantExclusionsTable.restaurantId, restaurantId)
      )
    );
  res.status(204).end();
});

// ─── Home Sections ───────────────────────────────────────────────────────────

const VALID_SECTIONS = ["popular", "deals"] as const;
type HomeSection = (typeof VALID_SECTIONS)[number];

function isValidSection(s: string): s is HomeSection {
  return (VALID_SECTIONS as readonly string[]).includes(s);
}

router.get("/admin/home-sections/:section", async (req, res) => {
  const section = String(req.params["section"]);
  if (!isValidSection(section)) { res.status(400).json({ error: "Invalid section" }); return; }

  const items = await db
    .select({
      id: homeSectionItemsTable.id,
      section: homeSectionItemsTable.section,
      restaurantId: homeSectionItemsTable.restaurantId,
      sortOrder: homeSectionItemsTable.sortOrder,
      restaurantName: restaurantsTable.name,
      restaurantNameAr: restaurantsTable.nameAr,
      restaurantImage: restaurantsTable.image,
    })
    .from(homeSectionItemsTable)
    .innerJoin(restaurantsTable, eq(homeSectionItemsTable.restaurantId, restaurantsTable.id))
    .where(eq(homeSectionItemsTable.section, section))
    .orderBy(asc(homeSectionItemsTable.sortOrder));

  res.json(items);
});

router.post("/admin/home-sections/:section", async (req, res) => {
  const section = String(req.params["section"]);
  if (!isValidSection(section)) { res.status(400).json({ error: "Invalid section" }); return; }

  const parsed = z.object({ restaurantId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db
    .select({ id: homeSectionItemsTable.id, sortOrder: homeSectionItemsTable.sortOrder })
    .from(homeSectionItemsTable)
    .where(eq(homeSectionItemsTable.section, section))
    .orderBy(desc(homeSectionItemsTable.sortOrder))
    .limit(1);

  const nextOrder = existing.length > 0 ? (existing[0]?.sortOrder ?? 0) + 1 : 0;
  const id = `hs_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  try {
    const [row] = await db
      .insert(homeSectionItemsTable)
      .values({ id, section, restaurantId: parsed.data.restaurantId, sortOrder: nextOrder })
      .returning();
    res.status(201).json(row);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) {
      res.status(409).json({ error: "Restaurant already in this section" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

router.delete("/admin/home-sections/:section/:restaurantId", async (req, res) => {
  const section = String(req.params["section"]);
  const restaurantId = String(req.params["restaurantId"]);
  if (!isValidSection(section)) { res.status(400).json({ error: "Invalid section" }); return; }

  await db
    .delete(homeSectionItemsTable)
    .where(and(eq(homeSectionItemsTable.section, section), eq(homeSectionItemsTable.restaurantId, restaurantId)));
  res.status(204).end();
});

router.put("/admin/home-sections/:section/order", async (req, res) => {
  const section = String(req.params["section"]);
  if (!isValidSection(section)) { res.status(400).json({ error: "Invalid section" }); return; }

  const parsed = z.object({
    items: z.array(z.object({ restaurantId: z.string(), sortOrder: z.number() })),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await Promise.all(
    parsed.data.items.map(({ restaurantId, sortOrder }) =>
      db
        .update(homeSectionItemsTable)
        .set({ sortOrder })
        .where(and(eq(homeSectionItemsTable.section, section), eq(homeSectionItemsTable.restaurantId, restaurantId)))
    )
  );
  res.json({ ok: true });
});

// ─── Restaurant Accounts ──────────────────────────────────────────────────────

router.get("/admin/restaurant-accounts", async (_req, res) => {
  const accounts = await db
    .select({
      id: restaurantUsersTable.id,
      restaurantId: restaurantUsersTable.restaurantId,
      phone: restaurantUsersTable.phone,
      name: restaurantUsersTable.name,
      authMode: restaurantUsersTable.authMode,
      isActive: restaurantUsersTable.isActive,
      createdAt: restaurantUsersTable.createdAt,
      restaurantName: restaurantsTable.nameAr,
    })
    .from(restaurantUsersTable)
    .leftJoin(restaurantsTable, eq(restaurantUsersTable.restaurantId, restaurantsTable.id))
    .orderBy(desc(restaurantUsersTable.createdAt));
  res.json(accounts);
});

router.post("/admin/restaurant-accounts", async (req, res) => {
  const { z } = await import("zod");
  const parsed = z.object({
    restaurantId: z.string().min(1),
    phone: z.string().min(1),
    name: z.string().optional(),
    password: z.string().optional(),
    authMode: z.enum(["password", "otp"]).default("password"),
    isActive: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { restaurantId, phone, name, password, authMode, isActive } = parsed.data;
  if (authMode === "password" && !password) { res.status(400).json({ error: "Password required for password auth mode" }); return; }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const id = `ru_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

  const [account] = await db.insert(restaurantUsersTable).values({ id, restaurantId, phone, name, passwordHash, authMode, isActive }).returning();
  res.status(201).json(account);
});

router.patch("/admin/restaurant-accounts/:id", async (req, res) => {
  const { z } = await import("zod");
  const accountId = String(req.params["id"]);
  const parsed = z.object({
    restaurantId: z.string().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
    password: z.string().optional(),
    authMode: z.enum(["password", "otp"]).optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { password, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (password) updateData["passwordHash"] = await bcrypt.hash(password, 10);

  const [updated] = await db.update(restaurantUsersTable).set(updateData).where(eq(restaurantUsersTable.id, accountId)).returning();
  if (!updated) { res.status(404).json({ error: "Account not found" }); return; }
  res.json(updated);
});

router.delete("/admin/restaurant-accounts/:id", async (req, res) => {
  const accountId = String(req.params["id"]);
  await db.delete(restaurantUsersTable).where(eq(restaurantUsersTable.id, accountId));
  res.status(204).end();
});

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

// ── Courier Notes ─────────────────────────────────────────────────────────────

router.get("/admin/couriers/:courierId/notes", async (req, res) => {
  const courierId = String(req.params["courierId"]);

  const [courier] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, courierId), eq(usersTable.role, "courier")))
    .limit(1);

  if (!courier) {
    res.status(404).json({ error: "Courier not found" });
    return;
  }

  const notes = await db
    .select()
    .from(adminNotesTable)
    .where(eq(adminNotesTable.courierId, courierId))
    .orderBy(desc(adminNotesTable.createdAt))
    .limit(3);

  res.json(notes);
});

router.post("/admin/couriers/:courierId/notes", async (req, res) => {
  const courierId = String(req.params["courierId"]);
  const body = z.object({ text: z.string().min(1).max(1000) }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: "النص مطلوب (1–1000 حرف)" });
    return;
  }

  const [courier] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, courierId), eq(usersTable.role, "courier")))
    .limit(1);

  if (!courier) {
    res.status(404).json({ error: "Courier not found" });
    return;
  }

  const id = crypto.randomUUID();
  const [note] = await db
    .insert(adminNotesTable)
    .values({ id, courierId, text: body.data.text, adminId: "admin" })
    .returning();

  res.status(201).json(note);
});

router.get("/admin/loyalty-settings", async (_req, res) => {
  const { getLoyaltySettings } = await import("../lib/loyalty");
  const settings = await getLoyaltySettings();
  res.json(settings);
});

router.put("/admin/loyalty-settings", async (req, res) => {
  const body = z.object({
    earnRate: z.number().min(0).max(1000),
    pointValue: z.number().min(0).max(100),
    referralRewardPoints: z.number().min(0).max(100000).optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "earnRate and pointValue required" });
    return;
  }
  const { getLoyaltySettings, saveLoyaltySettings } = await import("../lib/loyalty");
  // referralRewardPoints is optional in the request; keep the stored value when omitted.
  const current = await getLoyaltySettings();
  const merged = {
    earnRate: body.data.earnRate,
    pointValue: body.data.pointValue,
    referralRewardPoints: body.data.referralRewardPoints ?? current.referralRewardPoints,
  };
  await saveLoyaltySettings(merged);
  res.json(merged);
});

router.get("/admin/loyalty-users", async (_req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      role: usersTable.role,
      loyaltyPoints: usersTable.loyaltyPoints,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "customer"))
    .orderBy(desc(usersTable.loyaltyPoints))
    .limit(200);
  res.json(rows);
});

router.get("/admin/achievements-stats", requireAdmin, async (_req, res) => {
  const { ACHIEVEMENTS } = await import("../lib/achievements");
  const { userAchievementsTable } = await import("@workspace/db");
  const { count: drizzleCount } = await import("drizzle-orm");

  const rows = await db
    .select({
      achievementKey: userAchievementsTable.achievementKey,
      c: drizzleCount(),
    })
    .from(userAchievementsTable)
    .groupBy(userAchievementsTable.achievementKey);

  const stats = ACHIEVEMENTS.map((def) => {
    const row = rows.find((r) => r.achievementKey === def.key);
    return {
      key: def.key,
      icon: def.icon,
      titleAr: def.titleAr,
      titleEn: def.titleEn,
      earnedCount: Number(row?.c ?? 0),
    };
  });

  res.json({ stats });
});

router.get("/admin/subscription-settings", async (_req, res) => {
  const { getSubscriptionSettings } = await import("../lib/customerSubscription");
  const settings = await getSubscriptionSettings();
  res.json(settings);
});

router.put("/admin/subscription-settings", async (req, res) => {
  const body = z.object({
    monthlyPrice: z.number().int().min(0),
    subscriberDeliveryFee: z.number().int().min(0),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { saveSubscriptionSettings } = await import("../lib/customerSubscription");
  await saveSubscriptionSettings(body.data);
  res.json(body.data);
});

router.get("/admin/customer-subscriptions", async (_req, res) => {
  const { customerSubscriptionsTable } = await import("@workspace/db");
  const { asc: _asc } = await import("drizzle-orm");
  const rows = await db.execute(sql`
    SELECT
      cs.id,
      cs.user_id AS "userId",
      cs.starts_at AS "startsAt",
      cs.ends_at AS "endsAt",
      cs.plan_type AS "planType",
      cs.price_paid AS "pricePaid",
      cs.is_active AS "isActive",
      cs.created_by_admin AS "createdByAdmin",
      cs.created_at AS "createdAt",
      u.name AS "userName",
      u.phone AS "userPhone",
      u.wallet_balance AS "walletBalance"
    FROM customer_subscriptions cs
    JOIN users u ON u.id = cs.user_id
    ORDER BY cs.created_at DESC
    LIMIT 500
  `);
  res.json(rows.rows);
});

router.post("/admin/customer-subscriptions", async (req, res) => {
  const body = z.object({
    userId: z.string().min(1),
    durationDays: z.number().int().min(1).default(30),
    pricePaid: z.number().int().min(0).default(0),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const userRows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, body.data.userId))
    .limit(1);
  if (!userRows[0]) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  const { customerSubscriptionsTable } = await import("@workspace/db");
  const { and: _and, eq: _eq, lte: _lte } = await import("drizzle-orm");

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + body.data.durationDays);

  const id = `csub_${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

  const [sub] = await db.transaction(async (tx) => {
    // Deactivate any expired-but-still-active rows so the unique index doesn't block the insert.
    await tx
      .update(customerSubscriptionsTable)
      .set({ isActive: false })
      .where(
        _and(
          _eq(customerSubscriptionsTable.userId, body.data.userId),
          _eq(customerSubscriptionsTable.isActive, true),
          _lte(customerSubscriptionsTable.endsAt, now),
        ),
      );

    return tx
      .insert(customerSubscriptionsTable)
      .values({
        id,
        userId: body.data.userId,
        startsAt: now,
        endsAt,
        planType: "monthly",
        pricePaid: body.data.pricePaid,
        isActive: true,
        createdByAdmin: true,
      })
      .returning();
  });

  res.status(201).json(sub);
});

router.patch("/admin/customer-subscriptions/:id", async (req, res) => {
  const subId = String(req.params["id"]);
  const body = z.object({
    isActive: z.boolean(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { customerSubscriptionsTable } = await import("@workspace/db");

  const [updated] = await db
    .update(customerSubscriptionsTable)
    .set({ isActive: body.data.isActive })
    .where(eq(customerSubscriptionsTable.id, subId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json(updated);
});

router.get("/admin/referral-stats", async (_req, res) => {
  const [totalRow] = await db.select({ total: count() }).from(referralsTable);
  const [paidRow] = await db.select({ total: count() }).from(referralsTable).where(eq(referralsTable.status, "paid"));
  const [commissionsRow] = await db.select({ total: sum(referralsTable.commissionAmount) }).from(referralsTable).where(eq(referralsTable.status, "paid"));

  const referrals = await db
    .select({
      id: referralsTable.id,
      referrerId: referralsTable.referrerId,
      referrerName: usersTable.name,
      referrerPhone: usersTable.phone,
      referredUserId: referralsTable.referredUserId,
      commissionAmount: referralsTable.commissionAmount,
      status: referralsTable.status,
      createdAt: referralsTable.createdAt,
    })
    .from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.referrerId, usersTable.id))
    .orderBy(desc(referralsTable.createdAt))
    .limit(100);

  const referredUsersIds = referrals.map((r) => r.referredUserId);
  let referredNames: Map<string, { name: string; phone: string }> = new Map();
  if (referredUsersIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const referredRows = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(inArray(usersTable.id, referredUsersIds));
    referredNames = new Map(referredRows.map((r) => [r.id, { name: r.name, phone: r.phone }]));
  }

  const topReferrers = await db
    .select({
      referrerId: referralsTable.referrerId,
      referrerName: usersTable.name,
      referrerPhone: usersTable.phone,
      cnt: count(),
      earned: sum(referralsTable.commissionAmount),
    })
    .from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.referrerId, usersTable.id))
    .groupBy(referralsTable.referrerId, usersTable.name, usersTable.phone)
    .orderBy(desc(count()))
    .limit(10);

  res.json({
    totalReferrals: Number(totalRow?.total ?? 0),
    paidReferrals: Number(paidRow?.total ?? 0),
    totalCommissions: Number(commissionsRow?.total ?? 0),
    topReferrers: topReferrers.map((r) => ({
      userId: r.referrerId,
      name: r.referrerName ?? "",
      phone: r.referrerPhone ?? "",
      count: Number(r.cnt),
      earned: Number(r.earned ?? 0),
    })),
    referrals: referrals.map((r) => ({
      ...r,
      referrerName: r.referrerName ?? "",
      referrerPhone: r.referrerPhone ?? "",
      referredName: referredNames.get(r.referredUserId)?.name ?? "",
      referredPhone: referredNames.get(r.referredUserId)?.phone ?? "",
    })),
  });
});

router.get("/admin/whatsapp/accounts", (_req, res) => {
  res.json(whatsappManager.getStatus());
});

router.post("/admin/whatsapp/accounts", async (_req, res) => {
  const id = await whatsappManager.addAccount();
  res.status(201).json({ id });
});

router.delete("/admin/whatsapp/accounts/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await whatsappManager.disconnect(id);
  res.status(204).end();
});

router.get("/admin/subscription-requests", async (req, res) => {
  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : null;

  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.courier_id AS "courierId",
      r.plan_id AS "planId",
      r.plan_name AS "planName",
      r.plan_period AS "planPeriod",
      r.plan_price AS "planPrice",
      r.paid_amount AS "paidAmount",
      r.receipt_url AS "receiptUrl",
      r.status,
      r.admin_note AS "adminNote",
      r.reviewed_at AS "reviewedAt",
      r.created_at AS "createdAt",
      u.name AS "courierName",
      u.phone AS "courierPhone"
    FROM courier_subscription_requests r
    LEFT JOIN users u ON u.id = r.courier_id
    ${statusFilter ? sql`WHERE r.status = ${statusFilter}` : sql``}
    ORDER BY r.created_at DESC
  `);

  res.json(rows.rows.map((r: Record<string, unknown>) => ({
    ...r,
    planPrice: Number(r["planPrice"]),
    paidAmount: Number(r["paidAmount"]),
  })));
});

router.post("/admin/subscription-requests/:id/approve", async (req, res) => {
  const id = String(req.params["id"]);

  const [request] = await db
    .select()
    .from(courierSubscriptionRequestsTable)
    .where(eq(courierSubscriptionRequestsTable.id, id))
    .limit(1);

  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (request.status !== "pending") {
    res.status(409).json({ error: "Request is not pending" });
    return;
  }

  const now = new Date();
  const endsAt = addPeriodDuration(now, request.planPeriod);
  const subId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .update(courierSubscriptionRequestsTable)
      .set({ status: "approved", reviewedAt: now, reviewedBy: "admin" })
      .where(eq(courierSubscriptionRequestsTable.id, id));

    await tx
      .update(courierSubscriptionsTable)
      .set({ isActive: false })
      .where(and(
        eq(courierSubscriptionsTable.courierId, request.courierId),
        eq(courierSubscriptionsTable.isActive, true),
      ));

    await tx.insert(courierSubscriptionsTable).values({
      id: subId,
      courierId: request.courierId,
      planId: request.planId,
      planName: request.planName,
      planPeriod: request.planPeriod,
      startsAt: now,
      endsAt,
      amount: request.paidAmount,
      status: "paid",
      isActive: true,
      gifted: false,
      createdByAdmin: true,
    });
  });

  res.json({ ok: true, subscriptionId: subId });
});

router.post("/admin/subscription-requests/:id/reject", async (req, res) => {
  const id = String(req.params["id"]);
  const adminNote = typeof req.body?.adminNote === "string" ? req.body.adminNote : "";

  const [request] = await db
    .select({ id: courierSubscriptionRequestsTable.id, status: courierSubscriptionRequestsTable.status })
    .from(courierSubscriptionRequestsTable)
    .where(eq(courierSubscriptionRequestsTable.id, id))
    .limit(1);

  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (request.status !== "pending") {
    res.status(409).json({ error: "Request is not pending" });
    return;
  }

  await db
    .update(courierSubscriptionRequestsTable)
    .set({ status: "rejected", adminNote, reviewedAt: new Date() })
    .where(eq(courierSubscriptionRequestsTable.id, id));

  res.json({ ok: true });
});

export default router;

