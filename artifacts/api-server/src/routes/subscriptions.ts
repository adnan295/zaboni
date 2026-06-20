import { Router, type IRouter } from "express";
import { db, customerSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getSubscriptionSettings, getActiveSubscription } from "../lib/customerSubscription";

const router: IRouter = Router();

router.get("/subscriptions/status", async (req, res) => {
  const userId = req.auth!.userId;
  const [subscription, settings] = await Promise.all([
    getActiveSubscription(userId),
    getSubscriptionSettings(),
  ]);

  res.json({
    isSubscribed: subscription !== null,
    subscription: subscription ?? null,
    settings,
  });
});

router.post("/subscriptions/subscribe", async (req, res) => {
  const userId = req.auth!.userId;

  const existing = await getActiveSubscription(userId);
  if (existing) {
    res.status(409).json({ error: "already_subscribed", endsAt: existing.endsAt });
    return;
  }

  const settings = await getSubscriptionSettings();
  const price = settings.monthlyPrice;

  const [userRow] = await db
    .select({ walletBalance: usersTable.walletBalance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!userRow) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  if (userRow.walletBalance < price) {
    res.status(402).json({
      error: "insufficient_balance",
      required: price,
      balance: userRow.walletBalance,
    });
    return;
  }

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 1);

  const id = `csub_${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

  const [sub] = await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ walletBalance: sql`${usersTable.walletBalance} - ${price}` })
      .where(
        eq(usersTable.id, userId)
      );

    return tx
      .insert(customerSubscriptionsTable)
      .values({
        id,
        userId,
        startsAt: now,
        endsAt,
        planType: "monthly",
        pricePaid: price,
        isActive: true,
        createdByAdmin: false,
      })
      .returning();
  });

  res.status(201).json({ subscription: sub, newBalance: userRow.walletBalance - price });
});

const body = z.object({ isActive: z.boolean() });

router.patch("/subscriptions/:id/cancel", async (req, res) => {
  const userId = req.auth!.userId;
  const { id } = req.params;

  const rows = await db
    .select()
    .from(customerSubscriptionsTable)
    .where(eq(customerSubscriptionsTable.id, id))
    .limit(1);

  if (!rows[0] || rows[0].userId !== userId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const [updated] = await db
    .update(customerSubscriptionsTable)
    .set({ isActive: false })
    .where(eq(customerSubscriptionsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
