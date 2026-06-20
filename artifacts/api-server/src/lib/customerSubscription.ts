import { db, customerSubscriptionsTable, systemSettingsTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";

const DEFAULT_SUBSCRIPTION_PRICE = 10000;
const DEFAULT_SUBSCRIBER_DELIVERY_FEE = 0;

export interface SubscriptionSettings {
  monthlyPrice: number;
  subscriberDeliveryFee: number;
}

export async function getSubscriptionSettings(): Promise<SubscriptionSettings> {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(
      sql`${systemSettingsTable.key} IN ('customer_subscription_price', 'customer_subscription_delivery_fee')`
    );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    monthlyPrice: Number(map["customer_subscription_price"] ?? DEFAULT_SUBSCRIPTION_PRICE),
    subscriberDeliveryFee: Number(map["customer_subscription_delivery_fee"] ?? DEFAULT_SUBSCRIBER_DELIVERY_FEE),
  };
}

export async function saveSubscriptionSettings(settings: SubscriptionSettings): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values([
      { key: "customer_subscription_price", value: String(settings.monthlyPrice) },
      { key: "customer_subscription_delivery_fee", value: String(settings.subscriberDeliveryFee) },
    ])
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}

export async function isUserSubscribed(userId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select({ id: customerSubscriptionsTable.id })
    .from(customerSubscriptionsTable)
    .where(
      and(
        eq(customerSubscriptionsTable.userId, userId),
        eq(customerSubscriptionsTable.isActive, true),
        gt(customerSubscriptionsTable.endsAt, now)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function getActiveSubscription(userId: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(customerSubscriptionsTable)
    .where(
      and(
        eq(customerSubscriptionsTable.userId, userId),
        eq(customerSubscriptionsTable.isActive, true),
        gt(customerSubscriptionsTable.endsAt, now)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
