import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  supportMessagesTable,
  supportTicketsTable,
  usersTable,
  ordersTable,
} from "@workspace/db";
import { and, desc, eq, isNull, count, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminAuth";
import { logger } from "../lib/logger";
import { notifySupportMessage, notifyAdminSupportMessage } from "../orders/server";

const router = Router();

// ── Customer: GET /api/support/recent-orders ─────────────────────────────
router.get("/support/recent-orders", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const orders = await db
    .select({
      id: ordersTable.id,
      restaurantName: ordersTable.restaurantName,
      status: ordersTable.status,
      totalPrice: ordersTable.totalPrice,
      deliveryFee: ordersTable.deliveryFee,
      estimatedMinutes: ordersTable.estimatedMinutes,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);
  res.json(orders);
});

// ── Customer: GET /api/support/tickets ───────────────────────────────────
router.get("/support/tickets", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, userId))
    .orderBy(desc(supportTicketsTable.createdAt));

  // For each ticket get last message + unread count
  const enriched = await Promise.all(
    tickets.map(async (ticket) => {
      const lastMsgs = await db
        .select({
          id: supportMessagesTable.id,
          text: supportMessagesTable.text,
          senderRole: supportMessagesTable.senderRole,
          isRead: supportMessagesTable.isRead,
          createdAt: supportMessagesTable.createdAt,
        })
        .from(supportMessagesTable)
        .where(eq(supportMessagesTable.ticketId, ticket.id))
        .orderBy(desc(supportMessagesTable.createdAt))
        .limit(1);

      const unreadRows = await db
        .select({ id: supportMessagesTable.id })
        .from(supportMessagesTable)
        .where(
          and(
            eq(supportMessagesTable.ticketId, ticket.id),
            eq(supportMessagesTable.senderRole, "support"),
            eq(supportMessagesTable.isRead, false),
          ),
        );

      const lastMsg = lastMsgs[0] ?? null;

      let orderRef: string | null = null;
      if (ticket.orderId) {
        const orderRows = await db
          .select({ restaurantName: ordersTable.restaurantName })
          .from(ordersTable)
          .where(eq(ordersTable.id, ticket.orderId))
          .limit(1);
        orderRef = orderRows[0]?.restaurantName ?? null;
      }

      return {
        ...ticket,
        orderRef,
        unreadCount: unreadRows.length,
        lastMessage: lastMsg?.text ?? null,
        lastMessageAt: lastMsg?.createdAt ?? null,
      };
    }),
  );

  res.json(enriched);
});

// ── Customer: POST /api/support/tickets ──────────────────────────────────
const createTicketSchema = z.object({
  category: z.enum(["order_delayed", "wrong_items", "damaged", "payment", "other"]),
  orderId: z.string().optional().nullable(),
});

router.post("/support/tickets", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  // IDOR guard: if orderId is provided, verify it belongs to this user
  if (parsed.data.orderId) {
    const orderRows = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(eq(ordersTable.id, parsed.data.orderId), eq(ordersTable.userId, userId)))
      .limit(1);
    if (!orderRows[0]) {
      res.status(404).json({ error: "order_not_found" });
      return;
    }
  }

  const ticket = {
    id: crypto.randomUUID(),
    userId,
    orderId: parsed.data.orderId ?? null,
    category: parsed.data.category,
    status: "open" as const,
    createdAt: new Date(),
    resolvedAt: null,
  };

  await db.insert(supportTicketsTable).values(ticket);

  let orderRef: string | null = null;
  if (ticket.orderId) {
    const orderRows = await db
      .select({ restaurantName: ordersTable.restaurantName })
      .from(ordersTable)
      .where(eq(ordersTable.id, ticket.orderId))
      .limit(1);
    orderRef = orderRows[0]?.restaurantName ?? null;
  }

  logger.info({ userId, ticketId: ticket.id, category: ticket.category }, "Support ticket created");
  res.status(201).json({ ...ticket, orderRef, unreadCount: 0, lastMessage: null, lastMessageAt: null });
});

// ── Customer: GET /api/support/tickets/:id/messages ──────────────────────
router.get("/support/tickets/:id/messages", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const ticketId = String(req.params["id"]);

  // Verify ownership
  const ticketRows = await db
    .select()
    .from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.userId, userId)))
    .limit(1);

  if (!ticketRows[0]) {
    res.status(404).json({ error: "ticket_not_found" });
    return;
  }

  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, ticketId))
    .orderBy(supportMessagesTable.createdAt);

  // Mark support messages as read
  await db
    .update(supportMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(supportMessagesTable.ticketId, ticketId),
        eq(supportMessagesTable.senderRole, "support"),
      ),
    );

  res.json(messages);
});

// ── Customer: POST /api/support/tickets/:id/messages ─────────────────────
const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

router.post("/support/tickets/:id/messages", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const ticketId = String(req.params["id"]);

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  // Verify ownership + ticket open
  const ticketRows = await db
    .select()
    .from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.userId, userId)))
    .limit(1);

  if (!ticketRows[0]) {
    res.status(404).json({ error: "ticket_not_found" });
    return;
  }
  if (ticketRows[0].status === "resolved") {
    res.status(400).json({ error: "ticket_resolved" });
    return;
  }

  const msg = {
    id: crypto.randomUUID(),
    userId,
    ticketId,
    text: parsed.data.text,
    senderRole: "customer" as const,
    isRead: false,
    createdAt: new Date(),
  };
  await db.insert(supportMessagesTable).values(msg);

  // Notify admins via socket
  notifyAdminSupportMessage(userId, { ...msg, ticketId });

  logger.info({ userId, ticketId }, "Customer sent support message");
  res.status(201).json(msg);
});

// ── Customer: GET /api/support/unread-count ───────────────────────────────
router.get("/support/unread-count", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  // Unread from ticket-based messages
  const ticketUnread = await db
    .select({ id: supportMessagesTable.id })
    .from(supportMessagesTable)
    .innerJoin(
      supportTicketsTable,
      eq(supportMessagesTable.ticketId, supportTicketsTable.id),
    )
    .where(
      and(
        eq(supportTicketsTable.userId, userId),
        eq(supportMessagesTable.senderRole, "support"),
        eq(supportMessagesTable.isRead, false),
      ),
    );

  // Legacy unread (messages without ticketId)
  const legacyUnread = await db
    .select({ id: supportMessagesTable.id })
    .from(supportMessagesTable)
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.senderRole, "support"),
        eq(supportMessagesTable.isRead, false),
        isNull(supportMessagesTable.ticketId),
      ),
    );

  res.json({ count: ticketUnread.length + legacyUnread.length });
});

// ── Customer: PATCH /api/support/messages/mark-read (legacy) ─────────────
router.patch("/support/messages/mark-read", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  await db
    .update(supportMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.senderRole, "support"),
        isNull(supportMessagesTable.ticketId),
      ),
    );
  res.json({ ok: true });
});

// ── Customer: GET /api/support/messages (legacy) ─────────────────────────
router.get("/support/messages", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        isNull(supportMessagesTable.ticketId),
      ),
    )
    .orderBy(desc(supportMessagesTable.createdAt))
    .limit(100);
  res.json(messages.reverse());
});

// ── Customer: POST /api/support/messages (legacy) ────────────────────────
router.post("/support/messages", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const msg = {
    id: crypto.randomUUID(),
    userId,
    ticketId: null,
    text: parsed.data.text,
    senderRole: "customer" as const,
    isRead: false,
    createdAt: new Date(),
  };
  await db.insert(supportMessagesTable).values(msg);
  notifyAdminSupportMessage(userId, msg);
  logger.info({ userId }, "Customer sent support message (legacy)");
  res.status(201).json(msg);
});

// ── Admin: GET /api/admin/support/tickets ────────────────────────────────
router.get("/admin/support/tickets", requireAdmin, async (req, res) => {
  const status = req.query["status"] as string | undefined;
  const category = req.query["category"] as string | undefined;

  const conditions = [];
  if (status === "open" || status === "resolved") {
    conditions.push(eq(supportTicketsTable.status, status));
  }
  if (
    category &&
    ["order_delayed", "wrong_items", "damaged", "payment", "other"].includes(category)
  ) {
    conditions.push(
      eq(
        supportTicketsTable.category,
        category as "order_delayed" | "wrong_items" | "damaged" | "payment" | "other",
      ),
    );
  }

  const tickets = await db
    .select({
      id: supportTicketsTable.id,
      userId: supportTicketsTable.userId,
      orderId: supportTicketsTable.orderId,
      category: supportTicketsTable.category,
      status: supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      resolvedAt: supportTicketsTable.resolvedAt,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportTicketsTable.createdAt));

  // Enrich with last message + unread + orderRef
  const enriched = await Promise.all(
    tickets.map(async (ticket) => {
      const lastMsgs = await db
        .select({
          text: supportMessagesTable.text,
          senderRole: supportMessagesTable.senderRole,
          isRead: supportMessagesTable.isRead,
          createdAt: supportMessagesTable.createdAt,
        })
        .from(supportMessagesTable)
        .where(eq(supportMessagesTable.ticketId, ticket.id))
        .orderBy(desc(supportMessagesTable.createdAt))
        .limit(1);

      const unreadRows = await db
        .select({ id: supportMessagesTable.id })
        .from(supportMessagesTable)
        .where(
          and(
            eq(supportMessagesTable.ticketId, ticket.id),
            eq(supportMessagesTable.senderRole, "customer"),
            eq(supportMessagesTable.isRead, false),
          ),
        );

      let orderRef: string | null = null;
      if (ticket.orderId) {
        const orderRows = await db
          .select({ restaurantName: ordersTable.restaurantName })
          .from(ordersTable)
          .where(eq(ordersTable.id, ticket.orderId))
          .limit(1);
        orderRef = orderRows[0]?.restaurantName ?? null;
      }

      const lastMsg = lastMsgs[0] ?? null;
      return {
        ...ticket,
        orderRef,
        unreadCount: unreadRows.length,
        lastMessage: lastMsg?.text ?? null,
        lastMessageAt: lastMsg?.createdAt ?? null,
      };
    }),
  );

  res.json(enriched);
});

// ── Admin: GET /api/admin/support/tickets/:id ────────────────────────────
router.get("/admin/support/tickets/:id", requireAdmin, async (req, res) => {
  const ticketId = String(req.params["id"]);

  const ticketRows = await db
    .select({
      id: supportTicketsTable.id,
      userId: supportTicketsTable.userId,
      orderId: supportTicketsTable.orderId,
      category: supportTicketsTable.category,
      status: supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      resolvedAt: supportTicketsTable.resolvedAt,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .where(eq(supportTicketsTable.id, ticketId))
    .limit(1);

  if (!ticketRows[0]) {
    res.status(404).json({ error: "ticket_not_found" });
    return;
  }

  const ticket = ticketRows[0];

  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, ticketId))
    .orderBy(supportMessagesTable.createdAt);

  // Mark customer messages as read (admin viewed them)
  await db
    .update(supportMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(supportMessagesTable.ticketId, ticketId),
        eq(supportMessagesTable.senderRole, "customer"),
      ),
    );

  let order: {
    id: string;
    restaurantName: string;
    status: string;
    totalPrice: number | null;
    deliveryFee: number;
    createdAt: Date;
    estimatedMinutes: number;
  } | null = null;
  if (ticket.orderId) {
    const orderRows = await db
      .select({
        id: ordersTable.id,
        restaurantName: ordersTable.restaurantName,
        status: ordersTable.status,
        totalPrice: ordersTable.totalPrice,
        deliveryFee: ordersTable.deliveryFee,
        createdAt: ordersTable.createdAt,
        estimatedMinutes: ordersTable.estimatedMinutes,
      })
      .from(ordersTable)
      .where(eq(ordersTable.id, ticket.orderId))
      .limit(1);
    order = orderRows[0] ?? null;
  }

  res.json({
    ticket: { ...ticket, order },
    messages,
  });
});

// ── Admin: POST /api/admin/support/tickets/:id/messages ──────────────────
const adminReplySchema = z.object({
  text: z.string().min(1).max(2000),
});

router.post("/admin/support/tickets/:id/messages", requireAdmin, async (req, res) => {
  const ticketId = String(req.params["id"]);
  const parsed = adminReplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const ticketRows = await db
    .select({ userId: supportTicketsTable.userId, status: supportTicketsTable.status })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, ticketId))
    .limit(1);

  if (!ticketRows[0]) {
    res.status(404).json({ error: "ticket_not_found" });
    return;
  }

  // Block replies to resolved tickets — admin must reopen explicitly if policy changes
  if (ticketRows[0].status === "resolved") {
    res.status(400).json({ error: "ticket_resolved" });
    return;
  }

  const { userId } = ticketRows[0];

  const msg = {
    id: crypto.randomUUID(),
    userId,
    ticketId,
    text: parsed.data.text,
    senderRole: "support" as const,
    isRead: false,
    createdAt: new Date(),
  };
  await db.insert(supportMessagesTable).values(msg);

  // Notify the customer via socket
  notifySupportMessage(userId, msg);

  logger.info({ ticketId, userId }, "Admin sent support reply");
  res.status(201).json(msg);
});

// ── Admin: PATCH /api/admin/support/tickets/:id/resolve ──────────────────
router.patch("/admin/support/tickets/:id/resolve", requireAdmin, async (req, res) => {
  const ticketId = String(req.params["id"]);

  const result = await db
    .update(supportTicketsTable)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning({ id: supportTicketsTable.id });

  if (!result[0]) {
    res.status(404).json({ error: "ticket_not_found" });
    return;
  }

  logger.info({ ticketId }, "Support ticket resolved");
  res.json({ ok: true });
});

// ── Admin: GET /api/admin/support/unread-count ────────────────────────────
router.get("/admin/support/unread-count", requireAdmin, async (_req, res) => {
  const ticketUnread = await db
    .select({ id: supportMessagesTable.id })
    .from(supportMessagesTable)
    .innerJoin(
      supportTicketsTable,
      eq(supportMessagesTable.ticketId, supportTicketsTable.id),
    )
    .where(
      and(
        eq(supportMessagesTable.senderRole, "customer"),
        eq(supportMessagesTable.isRead, false),
        eq(supportTicketsTable.status, "open"),
      ),
    );

  const legacyUnread = await db
    .select({ id: supportMessagesTable.id })
    .from(supportMessagesTable)
    .where(
      and(
        eq(supportMessagesTable.senderRole, "customer"),
        eq(supportMessagesTable.isRead, false),
        isNull(supportMessagesTable.ticketId),
      ),
    );

  res.json({ count: ticketUnread.length + legacyUnread.length });
});

// ── Admin: legacy conversation routes (backward compat) ──────────────────
router.get("/admin/support/conversations", requireAdmin, async (req, res) => {
  const rows = await db
    .select({
      userId: supportMessagesTable.userId,
      userName: usersTable.name,
      userPhone: usersTable.phone,
      id: supportMessagesTable.id,
      text: supportMessagesTable.text,
      senderRole: supportMessagesTable.senderRole,
      isRead: supportMessagesTable.isRead,
      createdAt: supportMessagesTable.createdAt,
    })
    .from(supportMessagesTable)
    .leftJoin(usersTable, eq(supportMessagesTable.userId, usersTable.id))
    .where(isNull(supportMessagesTable.ticketId))
    .orderBy(desc(supportMessagesTable.createdAt));

  const convMap = new Map<
    string,
    {
      userId: string;
      userName: string | null;
      userPhone: string | null;
      lastMessageText: string;
      lastMessageAt: Date;
      unreadCount: number;
      totalCount: number;
    }
  >();

  for (const row of rows) {
    const existing = convMap.get(row.userId);
    if (!existing) {
      convMap.set(row.userId, {
        userId: row.userId,
        userName: row.userName ?? null,
        userPhone: row.userPhone ?? null,
        lastMessageText: row.text,
        lastMessageAt: row.createdAt,
        unreadCount: row.senderRole === "customer" && !row.isRead ? 1 : 0,
        totalCount: 1,
      });
    } else {
      existing.totalCount++;
      if (row.senderRole === "customer" && !row.isRead) {
        existing.unreadCount++;
      }
    }
  }

  const conversations = Array.from(convMap.values()).sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
  );
  res.json(conversations);
});

router.get("/admin/support/conversations/:userId", requireAdmin, async (req, res) => {
  const userId = String(req.params["userId"]);
  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(
      and(eq(supportMessagesTable.userId, userId), isNull(supportMessagesTable.ticketId)),
    )
    .orderBy(supportMessagesTable.createdAt);

  const userRows = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  await db
    .update(supportMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.senderRole, "customer"),
        isNull(supportMessagesTable.ticketId),
      ),
    );

  res.json({ user: userRows[0] ?? { name: null, phone: null }, messages });
});

router.post("/admin/support/conversations/:userId", requireAdmin, async (req, res) => {
  const userId = String(req.params["userId"]);
  const parsed = adminReplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const msg = {
    id: crypto.randomUUID(),
    userId,
    ticketId: null,
    text: parsed.data.text,
    senderRole: "support" as const,
    isRead: false,
    createdAt: new Date(),
  };
  await db.insert(supportMessagesTable).values(msg);
  notifySupportMessage(userId, msg);
  logger.info({ userId }, "Admin sent support reply (legacy)");
  res.status(201).json(msg);
});

export default router;
