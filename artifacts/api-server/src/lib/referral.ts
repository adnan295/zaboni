import {
  db,
  usersTable,
  referralCodesTable,
  referralsTable,
  loyaltyTransactionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getReferralRewardPoints } from "./loyalty";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db
    .select({ code: referralCodesTable.code })
    .from(referralCodesTable)
    .where(eq(referralCodesTable.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0]!.code;

  let code: string;
  let attempts = 0;
  while (true) {
    attempts++;
    code = generateReferralCode();
    try {
      await db.insert(referralCodesTable).values({
        id: `rc_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        userId,
        code,
      });
      return code;
    } catch {
      if (attempts >= 10) throw new Error("Failed to generate unique referral code");
    }
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reward the referrer with loyalty points (not cash) when their referred friend
 * completes their first order. The amount is a flat admin-configured number of
 * points, independent of the order value. `commissionAmount` on the referral row
 * now records the points granted, so referral history/reporting keeps working.
 */
export async function awardReferralPointsInTx(
  tx: Tx,
  referralId: string,
  referrerId: string,
  orderId: string
): Promise<number> {
  const points = await getReferralRewardPoints();
  if (points <= 0) {
    // Still mark the referral resolved so it isn't retried on every future order.
    await tx
      .update(referralsTable)
      .set({ status: "paid", orderId, commissionAmount: 0 })
      .where(eq(referralsTable.id, referralId));
    return 0;
  }

  await tx
    .update(referralsTable)
    .set({ status: "paid", orderId, commissionAmount: points })
    .where(eq(referralsTable.id, referralId));

  await tx
    .update(usersTable)
    .set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} + ${points}` })
    .where(eq(usersTable.id, referrerId));

  const txId = `loy_ref_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  await tx.insert(loyaltyTransactionsTable).values({
    id: txId,
    userId: referrerId,
    type: "earn",
    points,
    orderId,
    description: `نقاط إحالة — صديقك أكمل أول طلب 🎉`,
  });

  return points;
}
