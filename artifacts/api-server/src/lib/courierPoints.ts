import { db, usersTable, courierPointsTransactionsTable, courierSubscriptionsTable, courierSubscriptionPlansTable } from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { getLoyaltySettings } from "./loyalty";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<string, number> = { weekly: 7, monthly: 30, yearly: 365 };
const DEFAULT_DAILY_RATE = 5000; // SYP/day fallback when no plans are configured

/**
 * Courier points share the customer point value (loyalty_point_value) — one
 * admin setting governs both. A courier point is worth exactly `pointValue` SYP,
 * same as a customer point.
 */
export async function getCourierPointValue(): Promise<number> {
  const { pointValue } = await getLoyaltySettings();
  return pointValue > 0 ? pointValue : 1;
}

/**
 * Price of one subscription day in SYP, derived from the cheapest active courier
 * plan (price ÷ days-in-period). No dedicated setting — it follows the courier
 * subscription plans configured in admin.
 */
export async function getCourierDailyRate(): Promise<number> {
  const plans = await db
    .select()
    .from(courierSubscriptionPlansTable)
    .where(eq(courierSubscriptionPlansTable.isActive, true));
  let best = Infinity;
  for (const p of plans) {
    const days = PERIOD_DAYS[p.period] ?? 30;
    if (days > 0 && p.price > 0) best = Math.min(best, p.price / days);
  }
  return Number.isFinite(best) ? Math.max(1, Math.round(best)) : DEFAULT_DAILY_RATE;
}

/** Points a courier must spend for one subscription day. */
export async function getCourierPointsPerDay(): Promise<{ pointsPerDay: number; pointValue: number; dailyRate: number }> {
  const [pointValue, dailyRate] = await Promise.all([getCourierPointValue(), getCourierDailyRate()]);
  return { pointsPerDay: Math.max(1, Math.ceil(dailyRate / pointValue)), pointValue, dailyRate };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Award reward points to the courier that delivered an order, to compensate for
 * a delivery-fee discount the customer used. `feeDiscountSyp` is the lost fee in
 * SYP; it's converted to points at the shared point value so the points are
 * worth exactly the amount lost. Best-effort — callers must not let it block
 * order completion.
 */
export async function awardCourierPointsInTx(
  tx: Tx,
  courierId: string,
  orderId: string,
  feeDiscountSyp: number,
  pointValue: number,
  description?: string,
): Promise<number> {
  if (!courierId || feeDiscountSyp <= 0) return 0;
  const points = Math.round(feeDiscountSyp / (pointValue > 0 ? pointValue : 1));
  if (points <= 0) return 0;
  await tx.insert(courierPointsTransactionsTable).values({
    id: `crp_earn_${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
    courierId,
    type: "earn",
    points,
    orderId,
    description: description ?? `تعويض خصم على طلب #${orderId.slice(-6)}`,
  });
  await tx
    .update(usersTable)
    .set({ courierPoints: sql`${usersTable.courierPoints} + ${points}` })
    .where(eq(usersTable.id, courierId));
  return points;
}

export type RedeemResult =
  | { ok: true; daysAdded: number; pointsSpent: number; newEndsAt: Date; newBalance: number }
  | { ok: false; error: "invalid_days" | "insufficient_points" };

/**
 * Redeem a courier's points for extra subscription days. Days cost
 * ceil(dailyRate / pointValue) points each, both taken from admin config
 * (subscription plans + the shared point value). Extends the courier's latest
 * subscription from max(now, endsAt); creates a waived one if they never had a
 * subscription. Points are deducted atomically so a double-tap can't overspend.
 */
export async function redeemCourierPointsForDays(courierId: string, days: number): Promise<RedeemResult> {
  if (!Number.isInteger(days) || days <= 0) return { ok: false, error: "invalid_days" };
  const { pointsPerDay } = await getCourierPointsPerDay();
  const cost = days * pointsPerDay;

  return await db.transaction(async (tx): Promise<RedeemResult> => {
    const deducted = await tx
      .update(usersTable)
      .set({ courierPoints: sql`${usersTable.courierPoints} - ${cost}` })
      .where(and(eq(usersTable.id, courierId), sql`${usersTable.courierPoints} >= ${cost}`))
      .returning({ balance: usersTable.courierPoints });
    if (deducted.length === 0) return { ok: false, error: "insufficient_points" };

    const [latest] = await tx
      .select()
      .from(courierSubscriptionsTable)
      .where(eq(courierSubscriptionsTable.courierId, courierId))
      .orderBy(desc(courierSubscriptionsTable.endsAt))
      .limit(1);

    const now = new Date();
    let newEndsAt: Date;
    if (latest) {
      const base = latest.endsAt > now ? latest.endsAt : now;
      newEndsAt = new Date(base.getTime() + days * DAY_MS);
      await tx
        .update(courierSubscriptionsTable)
        .set({ endsAt: newEndsAt, isActive: true })
        .where(eq(courierSubscriptionsTable.id, latest.id));
    } else {
      newEndsAt = new Date(now.getTime() + days * DAY_MS);
      await tx.insert(courierSubscriptionsTable).values({
        id: `csub_pts_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        courierId,
        planId: null,
        planName: "أيام مستبدلة بالنقاط",
        planPeriod: "monthly",
        startsAt: now,
        endsAt: newEndsAt,
        amount: 0,
        status: "waived",
        isActive: true,
        gifted: false,
        note: "تم إنشاؤه عبر استبدال نقاط السائق",
      });
    }

    await tx.insert(courierPointsTransactionsTable).values({
      id: `crp_redeem_${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      courierId,
      type: "redeem",
      points: cost,
      orderId: null,
      description: `استبدال ${cost} نقطة مقابل ${days} يوم اشتراك`,
    });

    return { ok: true, daysAdded: days, pointsSpent: cost, newEndsAt, newBalance: deducted[0]!.balance };
  });
}
