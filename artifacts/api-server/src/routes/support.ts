import { Router, type Request, type Response, type NextFunction } from "express";
import { db, supportMessagesTable, usersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";
import { notifySupportMessage, notifyAdminSupportMessage } from "../orders/server";

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: "admin_not_configured" });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!token || token !== ADMIN_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

const router = Router();

// ── Customer: GET /api/support/messages ──────────────────────────────────
router.get("/support/messages", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.userId, userId))
    .orderBy(desc(supportMessagesTable.createdAt))
    .limit(100);
  res.json(messages.reverse());
});

// ── Customer: POST /api/support/messages ─────────────────────────────────
const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

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
    text: parsed.data.text,
    senderRole: "customer" as const,
    isRead: false,
    createdAt: new Date(),
  };
  await db.insert(supportMessagesTable).values(msg);

  // Notify admins via socket
  notifyAdminSupportMessage(userId, msg);

  logger.info({ userId }, "Customer sent support message");
  res.status(201).json(msg);
});

// ── Customer: PATCH /api/support/messages/mark-read ──────────────────────
router.patch("/support/messages/mark-read", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  await db
    .update(supportMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.senderRole, "support"),
      ),
    );
  res.json({ ok: true });
});

// ── Customer: GET /api/support/unread-count ───────────────────────────────
router.get("/support/unread-count", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const rows = await db
    .select({ id: supportMessagesTable.id })
    .from(supportMessagesTable)
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.senderRole, "support"),
        eq(supportMessagesTable.isRead, false),
      ),
    );
  res.json({ count: rows.length });
});

// ── Admin: GET /api/admin/support/conversations ───────────────────────────
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
    .orderBy(desc(supportMessagesTable.createdAt));

  // Group by userId, pick last message per conversation
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

// ── Admin: GET /api/admin/support/conversations/:userId ───────────────────
router.get("/admin/support/conversations/:userId", requireAdmin, async (req, res) => {
  const userId = String(req.params["userId"]);
  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.userId, userId))
    .orderBy(supportMessagesTable.createdAt);

  // Fetch user info
  const userRows = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Mark customer messages as read (admin viewed them)
  await db
    .update(supportMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(supportMessagesTable.userId, userId),
        eq(supportMessagesTable.senderRole, "customer"),
      ),
    );

  res.json({
    user: userRows[0] ?? { name: null, phone: null },
    messages,
  });
});

// ── Admin: POST /api/admin/support/conversations/:userId ──────────────────
const adminReplySchema = z.object({
  text: z.string().min(1).max(2000),
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
    text: parsed.data.text,
    senderRole: "support" as const,
    isRead: false,
    createdAt: new Date(),
  };
  await db.insert(supportMessagesTable).values(msg);

  // Notify the customer via socket
  notifySupportMessage(userId, msg);

  logger.info({ userId }, "Admin sent support reply");
  res.status(201).json(msg);
});

// ── Admin: GET /api/admin/support/unread-count ────────────────────────────
router.get("/admin/support/unread-count", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({ id: supportMessagesTable.id })
    .from(supportMessagesTable)
    .where(
      and(
        eq(supportMessagesTable.senderRole, "customer"),
        eq(supportMessagesTable.isRead, false),
      ),
    );
  res.json({ count: rows.length });
});

export default router;
