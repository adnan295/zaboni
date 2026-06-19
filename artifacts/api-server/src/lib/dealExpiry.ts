import { db, menuItemsTable } from "@workspace/db";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function expireStaleDeals(): Promise<void> {
  const now = new Date();

  let expired: { id: string; nameAr: string }[];
  try {
    expired = await db
      .select({ id: menuItemsTable.id, nameAr: menuItemsTable.nameAr })
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.isDeal, true),
          isNotNull(menuItemsTable.dealExpiresAt),
          lte(menuItemsTable.dealExpiresAt, now),
        ),
      );
  } catch (err) {
    logger.warn({ err }, "Deal expiry check skipped (column may not exist yet)");
    return;
  }

  if (expired.length === 0) return;

  logger.info({ count: expired.length }, "Auto-expiring stale deals");

  for (const item of expired) {
    try {
      await db
        .update(menuItemsTable)
        .set({ isDeal: false, dealPrice: null, dealExpiresAt: null })
        .where(
          and(
            eq(menuItemsTable.id, item.id),
            eq(menuItemsTable.isDeal, true),
          ),
        );
      logger.info({ itemId: item.id, nameAr: item.nameAr }, "Deal auto-expired");
    } catch (err) {
      logger.error({ err, itemId: item.id }, "Failed to auto-expire deal");
    }
  }
}

export function startDealExpiryJob(): void {
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Deal expiry job started");

  void expireStaleDeals();

  setInterval(() => {
    void expireStaleDeals();
  }, CHECK_INTERVAL_MS);
}
