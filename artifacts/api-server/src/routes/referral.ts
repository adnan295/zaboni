import { Router, type IRouter } from "express";
import { db, usersTable, referralsTable, referralCodesTable, customerWalletTransactionsTable } from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { getOrCreateReferralCode } from "../lib/referral";

function resolveUserId(req: import("express").Request): string {
  return req.auth!.userId;
}

const router: IRouter = Router();

router.get("/referrals/my-code", async (req, res) => {
  const userId = resolveUserId(req);
  const code = await getOrCreateReferralCode(userId);

  const [allReferrals, paidReferrals] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(referralsTable).where(eq(referralsTable.referrerId, userId)),
    db.select({ total: sql<number>`count(*)`, earned: sql<number>`coalesce(sum(commission_amount), 0)` })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, userId), eq(referralsTable.status, "paid"))),
  ]);

  res.json({
    code,
    totalReferrals: Number(allReferrals[0]?.total ?? 0),
    totalPaidReferrals: Number(paidReferrals[0]?.total ?? 0),
    totalEarned: Number(paidReferrals[0]?.earned ?? 0),
  });
});

router.get("/wallet/balance", async (req, res) => {
  const userId = resolveUserId(req);
  const [user] = await db
    .select({ walletBalance: usersTable.walletBalance })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  res.json({ balance: user?.walletBalance ?? 0 });
});

router.get("/wallet/transactions", async (req, res) => {
  const userId = resolveUserId(req);
  const [userRow, txs] = await Promise.all([
    db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    db
      .select()
      .from(customerWalletTransactionsTable)
      .where(eq(customerWalletTransactionsTable.userId, userId))
      .orderBy(desc(customerWalletTransactionsTable.createdAt))
      .limit(50),
  ]);

  res.json({ balance: userRow[0]?.walletBalance ?? 0, transactions: txs });
});

export default router;
