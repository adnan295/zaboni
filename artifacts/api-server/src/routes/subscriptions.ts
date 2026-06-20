import { Router, type IRouter } from "express";
import { db, customerSubscriptionsTable, usersTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";
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
  const settings = await getSubscriptionSettings();
  const price = settings.monthlyPrice;

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 1);
  const id = `csub_${Date.now()}${Math.random().toString(36).slice(2, 9)}`;

  let outcome: "ok" | "not_found" | "insufficient_balance" | "already_subscribed" = "ok";
  let newBalance = 0;
  let sub: (typeof customerSubscriptionsTable.$inferSelect) | null = null;

  try {
    await db.transaction(async (tx) => {
      // 1. Check for an existing active subscription inside the transaction so
      //    concurrent requests can't both slip through the app-level guard.
      const [existing] = await tx
        .select({ id: customerSubscriptionsTable.id })
        .from(customerSubscriptionsTable)
        .where(
          and(
            eq(customerSubscriptionsTable.userId, userId),
            eq(customerSubscriptionsTable.isActive, true),
            gt(customerSubscriptionsTable.endsAt, now),
          ),
        )
        .limit(1);

      if (existing) {
        outcome = "already_subscribed";
        return;
      }

      // 2. Conditionally deduct balance — only succeeds when wallet_balance >= price.
      //    The WHERE guard makes this race-safe: only one concurrent request wins.
      const updated = await tx
        .update(usersTable)
        .set({ walletBalance: sql`${usersTable.walletBalance} - ${price}` })
        .where(and(eq(usersTable.id, userId), sql`${usersTable.walletBalance} >= ${price}`))
        .returning({ newBalance: usersTable.walletBalance });

      if (updated.length === 0) {
        const [userRow] = await tx
          .select({ walletBalance: usersTable.walletBalance })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        outcome = userRow ? "insufficient_balance" : "not_found";
        return;
      }

      newBalance = updated[0]!.newBalance;

      // 3. Insert the subscription.
      // The partial unique index (user_id WHERE is_active=true) provides the
      // final DB-level guarantee: even if two transactions both reach this point,
      // only one INSERT will succeed. The loser gets a unique-violation error.
      const [inserted] = await tx
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

      sub = inserted ?? null;
    });
  } catch (err: unknown) {
    // PostgreSQL unique_violation (23505) from the partial unique index means
    // a concurrent request already created an active subscription. Roll back the
    // wallet deduction automatically (transaction aborted) and return 409.
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      res.status(409).json({ error: "already_subscribed" });
      return;
    }
    throw err;
  }

  if (outcome === "already_subscribed") {
    res.status(409).json({ error: "already_subscribed" });
    return;
  }
  if (outcome === "not_found") {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  if (outcome === "insufficient_balance") {
    res.status(402).json({ error: "insufficient_balance", required: price });
    return;
  }

  res.status(201).json({ subscription: sub, newBalance });
});

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
