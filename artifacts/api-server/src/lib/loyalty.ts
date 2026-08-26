import { db, usersTable, loyaltyTransactionsTable, systemSettingsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const DEFAULT_EARN_RATE = 10;
const DEFAULT_POINT_VALUE = 1;
// Points awarded to the referrer when a referred friend completes their first
// order. Admin-configurable; this is only the fallback when unset.
const DEFAULT_REFERRAL_REWARD_POINTS = 500;
// How points are earned per order:
//   "per_price" → scales with the order total (the original behavior, which made
//                 pricey errand orders out-earn cheap restaurant orders)
//   "flat"      → a fixed number of points per order, set separately for
//                 restaurant and errand orders, so the admin fully controls it.
const DEFAULT_POINTS_MODE = "per_price";
const DEFAULT_FLAT_POINTS = 5;

export type PointsMode = "per_price" | "flat";

export interface LoyaltySettings {
  earnRate: number;
  pointValue: number;
  referralRewardPoints: number;
  pointsMode: PointsMode;
  flatPointsRestaurant: number;
  flatPointsErrand: number;
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(
      sql`${systemSettingsTable.key} IN ('loyalty_earn_rate', 'loyalty_point_value', 'referral_reward_points', 'loyalty_points_mode', 'loyalty_flat_points_restaurant', 'loyalty_flat_points_errand')`
    );

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const mode: PointsMode = map["loyalty_points_mode"] === "flat" ? "flat" : DEFAULT_POINTS_MODE;
  return {
    earnRate: Number(map["loyalty_earn_rate"] ?? DEFAULT_EARN_RATE),
    pointValue: Number(map["loyalty_point_value"] ?? DEFAULT_POINT_VALUE),
    referralRewardPoints: Number(map["referral_reward_points"] ?? DEFAULT_REFERRAL_REWARD_POINTS),
    pointsMode: mode,
    flatPointsRestaurant: Number(map["loyalty_flat_points_restaurant"] ?? DEFAULT_FLAT_POINTS),
    flatPointsErrand: Number(map["loyalty_flat_points_errand"] ?? DEFAULT_FLAT_POINTS),
  };
}

export async function saveLoyaltySettings(settings: LoyaltySettings): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values([
      { key: "loyalty_earn_rate", value: String(settings.earnRate) },
      { key: "loyalty_point_value", value: String(settings.pointValue) },
      { key: "referral_reward_points", value: String(settings.referralRewardPoints) },
      { key: "loyalty_points_mode", value: settings.pointsMode },
      { key: "loyalty_flat_points_restaurant", value: String(settings.flatPointsRestaurant) },
      { key: "loyalty_flat_points_errand", value: String(settings.flatPointsErrand) },
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

// Points a single order earns, honoring the admin's chosen mode. In "flat" mode
// the order type decides the fixed amount (restaurant vs errand); otherwise it
// scales with the order total as before.
export function pointsForOrder(
  orderType: string,
  totalPriceSyp: number,
  settings: LoyaltySettings,
): number {
  if (settings.pointsMode === "flat") {
    const flat = orderType === "errand" ? settings.flatPointsErrand : settings.flatPointsRestaurant;
    return Math.max(0, Math.round(Number.isFinite(flat) ? flat : 0));
  }
  return calculateEarnedPoints(totalPriceSyp, settings.earnRate);
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
  settings: LoyaltySettings,
  orderType: string = "restaurant"
): Promise<number> {
  const points = pointsForOrder(orderType, totalPriceSyp, settings);
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
  settings: LoyaltySettings,
  orderType: string = "restaurant"
): Promise<number> {
  return db.transaction((tx) => awardPointsInTx(tx, userId, orderId, totalPriceSyp, settings, orderType));
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
