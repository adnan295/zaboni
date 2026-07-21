import { db, usersTable, courierPointsTransactionsTable, courierSubscriptionsTable, systemSettingsTable } from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_POINTS_PER_DAY = 5000;

export interface CourierPointsSettings {
  /** How many points a courier spends for one day of subscription. */
  pointsPerDay: number;
}

export async function getCourierPointsSettings(): Promise<CourierPointsSettings> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(sql`${systemSettingsTable.key} IN ('courier_points_per_day')`);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    pointsPerDay: Number(map["courier_points_per_day"] ?? DEFAULT_POINTS_PER_DAY),
  };
}

export async function saveCourierPointsSettings(settings: CourierPointsSettings): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values([{ key: "courier_points_per_day", value: String(Math.max(1, Math.round(settings.pointsPerDay))) }])
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Award reward points to the courier that delivered an order — used to
 * compensate for the delivery-fee discount the customer received. Best-effort:
 * callers wrap this so a failure never blocks order completion.
 */
export async function awardCourierPointsInTx(
  tx: Tx,
  courierId: string,
  orderId: string,
  points: number,
  description?: string,
): Promise<number> {
  if (!courierId || points <= 0) return 0;
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
 * Redeem a courier's points for extra subscription days. Extends the courier's
 * latest subscription from max(now, endsAt); if they never had one, a waived
 * subscription is created to hold the redeemed days. Points are deducted
 * atomically (guarded by balance >= cost) so a double-tap can't overspend.
 */
export async function redeemCourierPointsForDays(courierId: string, days: number): Promise<RedeemResult> {
  if (!Number.isInteger(days) || days <= 0) return { ok: false, error: "invalid_days" };
  const { pointsPerDay } = await getCourierPointsSettings();
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
