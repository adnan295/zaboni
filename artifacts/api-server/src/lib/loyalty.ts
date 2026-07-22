import { db, usersTable, loyaltyTransactionsTable, systemSettingsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const DEFAULT_EARN_RATE = 10;
const DEFAULT_POINT_VALUE = 1;
// Points awarded to the referrer when a referred friend completes their first
// order. Admin-configurable; this is only the fallback when unset.
const DEFAULT_REFERRAL_REWARD_POINTS = 500;

export interface LoyaltySettings {
  earnRate: number;
  pointValue: number;
  referralRewardPoints: number;
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(
      sql`${systemSettingsTable.key} IN ('loyalty_earn_rate', 'loyalty_point_value', 'referral_reward_points')`
    );

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    earnRate: Number(map["loyalty_earn_rate"] ?? DEFAULT_EARN_RATE),
    pointValue: Number(map["loyalty_point_value"] ?? DEFAULT_POINT_VALUE),
    referralRewardPoints: Number(map["referral_reward_points"] ?? DEFAULT_REFERRAL_REWARD_POINTS),
  };
}

export async function saveLoyaltySettings(settings: LoyaltySettings): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values([
      { key: "loyalty_earn_rate", value: String(settings.earnRate) },
      { key: "loyalty_point_value", value: String(settings.pointValue) },
      { key: "referral_reward_points", value: String(settings.referralRewardPoints) },
    ])
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}

/** Points a referrer earns per successful referral (admin-configurable). */
export async function getReferralRewardPoints(): Promise<number> {
  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "referral_reward_points"))
    .limit(1);
  const n = Number(row?.value ?? DEFAULT_REFERRAL_REWARD_POINTS);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_REFERRAL_REWARD_POINTS;
}

export function calculateEarnedPoints(totalPriceSyp: number, earnRate: number): number {
  if (totalPriceSyp <= 0 || earnRate <= 0) return 0;
  return Math.floor((totalPriceSyp / 1000) * earnRate);
}

export function calculateRedeemDiscount(points: number, pointValue: number): number {
  return Math.floor(points * pointValue);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function awardPointsInTx(
  tx: Tx,
  userId: string,
  orderId: string,
  totalPriceSyp: number,
  settings: LoyaltySettings
): Promise<number> {
  const points = calculateEarnedPoints(totalPriceSyp, settings.earnRate);
  if (points <= 0) return 0;

  const txId = `loy_earn_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

  await tx.insert(loyaltyTransactionsTable).values({
    id: txId,
    userId,
    type: "earn",
    points,
    orderId,
    description: `كسب نقاط من طلب #${orderId.slice(-6)}`,
  });
  await tx
    .update(usersTable)
    .set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} + ${points}` })
    .where(eq(usersTable.id, userId));

  return points;
}

export async function awardLoyaltyPoints(
  userId: string,
  orderId: string,
  totalPriceSyp: number,
  settings: LoyaltySettings
): Promise<number> {
  return db.transaction((tx) => awardPointsInTx(tx, userId, orderId, totalPriceSyp, settings));
}

export async function redeemPointsInTx(
  tx: Tx,
  userId: string,
  orderId: string,
  points: number,
  settings: LoyaltySettings
): Promise<number> {
  const discountAmount = calculateRedeemDiscount(points, settings.pointValue);
  if (discountAmount <= 0 || points <= 0) return 0;

  // Atomic guard: decrement only when current balance >= requested points.
  // Single UPDATE avoids the read-then-write race where two concurrent
  // requests both pass the balance check and both deduct.
  const deducted = await tx
    .update(usersTable)
    .set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} - ${points}` })
    .where(
      and(
        eq(usersTable.id, userId),
        sql`${usersTable.loyaltyPoints} >= ${points}`
      )
    )
    .returning({ loyaltyPoints: usersTable.loyaltyPoints });

  if (deducted.length === 0) {
    throw new Error("Insufficient loyalty points");
  }

  const txId = `loy_redeem_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  await tx.insert(loyaltyTransactionsTable).values({
    id: txId,
    userId,
    type: "redeem",
    points,
    orderId,
    description: `استخدام نقاط في طلب #${orderId.slice(-6)}`,
  });

  return discountAmount;
}

export async function redeemLoyaltyPoints(
  userId: string,
  orderId: string,
  points: number,
  settings: LoyaltySettings
): Promise<number> {
  return db.transaction((tx) => redeemPointsInTx(tx, userId, orderId, points, settings));
}
