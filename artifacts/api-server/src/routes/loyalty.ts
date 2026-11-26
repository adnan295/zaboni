import { Router, type IRouter } from "express";
import { db, usersTable, loyaltyTransactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getLoyaltySettings, calculateRedeemDiscount, CUSTOMER_POINTS_ENABLED } from "../lib/loyalty";

const router: IRouter = Router();

router.get("/users/me/loyalty", async (req, res) => {
  const userId = req.auth!.userId;

  const [user, transactions, settings] = await Promise.all([
    db
      .select({ loyaltyPoints: usersTable.loyaltyPoints })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1),
    db
      .select()
      .from(loyaltyTransactionsTable)
      .where(eq(loyaltyTransactionsTable.userId, userId))
      .orderBy(desc(loyaltyTransactionsTable.createdAt))
      .limit(50),
    getLoyaltySettings(),
  ]);

  if (!user[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Points are switched off: report nothing to spend, so app versions that still
  // show a «use points» toggle hide it instead of promising a discount that will
  // not be applied. The stored balance is left untouched.
  const balance = CUSTOMER_POINTS_ENABLED ? user[0].loyaltyPoints : 0;
  const redeemDiscount = calculateRedeemDiscount(balance, settings.pointValue);

  res.json({
    balance,
    redeemDiscount,
    earnRate: settings.earnRate,
    pointValue: settings.pointValue,
    transactions,
  });
});

export default router;
