import { db, ordersTable, orderStatusHistoryTable, usersTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { sendOrderPush, notifyOrderUpdate } from "../orders/server";
import { logger } from "./logger";

const EXPIRY_MINUTES = 30;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function expireStaleOrders(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

  const stale = await db
    .select({
      id: ordersTable.id,
      userId: ordersTable.userId,
      restaurantName: ordersTable.restaurantName,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "searching"),
        lt(ordersTable.createdAt, cutoff),
      ),
    );

  if (stale.length === 0) return;

  logger.info({ count: stale.length }, "Auto-cancelling stale orders");

  for (const order of stale) {
    try {
      const updated = await db
        .update(ordersTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(ordersTable.id, order.id),
            eq(ordersTable.status, "searching"),
          ),
        )
        .returning();

      if (updated.length === 0) continue;

      await db.insert(orderStatusHistoryTable).values({
        id: `${order.id}_autoexp_${Date.now()}`,
        orderId: order.id,
        status: "cancelled",
        note: "auto_expired",
      });

      notifyOrderUpdate(order.userId, { ...updated[0], cancelNote: "auto_expired" });

      const customer = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, order.userId))
        .limit(1);

      const name = customer[0]?.name ?? "";
      const greeting = name ? `${name}، ` : "";
      const restaurant = order.restaurantName ? ` من ${order.restaurantName}` : "";

      await sendOrderPush(
        order.userId,
        `${greeting}لم يتوفر سائق لطلبك${restaurant}. يرجى المحاولة مجدداً.`,
      );

      logger.info({ orderId: order.id, userId: order.userId }, "Order auto-expired");
    } catch (err) {
      logger.error({ err, orderId: order.id }, "Failed to auto-expire order");
    }
  }
}

export function startOrderExpiryJob(): void {
  logger.info(
    { intervalMs: CHECK_INTERVAL_MS, expiryMinutes: EXPIRY_MINUTES },
    "Order expiry job started",
  );

  void expireStaleOrders();

  setInterval(() => {
    void expireStaleOrders();
  }, CHECK_INTERVAL_MS);
}
