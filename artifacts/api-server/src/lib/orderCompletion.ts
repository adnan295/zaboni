import { db, ordersTable, referralsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getLoyaltySettings, awardPointsInTx } from "./loyalty";
import { awardCourierPointsInTx, getCourierPointValue } from "./courierPoints";
import { awardReferralPointsInTx } from "./referral";
import { sendPushToUsers } from "./push";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ReferralReward = { userId: string; points: number } | null;
// The caller must atomically transition the order to delivered first. Both admin
// and courier completion use this ledger path; a retry must not award twice.
export async function completeOrderInTx(tx: Tx, order: typeof ordersTable.$inferSelect): Promise<ReferralReward> {
  const total = order.totalPrice ?? order.deliveryFee;
  if (total > 0) {
    await awardPointsInTx(tx, order.userId, order.id, total, await getLoyaltySettings(), order.orderType);
  }
  if (order.courierId && order.courierFeeDiscount > 0) {
    await awardCourierPointsInTx(tx, order.courierId, order.id, order.courierFeeDiscount, await getCourierPointValue());
  }
  const [referral] = await tx.select({ id: referralsTable.id, referrerId: referralsTable.referrerId })
    .from(referralsTable).where(and(eq(referralsTable.referredUserId, order.userId), eq(referralsTable.status, "pending"))).limit(1).for("update");
  if (referral && referral.referrerId !== order.userId) {
    const points = await awardReferralPointsInTx(tx, referral.id, referral.referrerId, order.id);
    if (points > 0) return { userId: referral.referrerId, points };
  }
  return null;
}
export function notifyReferralReward(reward: ReferralReward): void {
  if (!reward) return;
  // Only called after the database transaction has committed.
  void sendPushToUsers([reward.userId], `🎁 ربحت ${reward.points.toLocaleString()} نقطة من الإحالة!`,
    "تهانينا! صديقك أكمل أول طلب بنجاح 🎉", { type: "referral" }).catch(() => {});
}
