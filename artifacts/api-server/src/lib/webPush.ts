import webpush from "web-push";
import { db, restaurantPushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let _initialized = false;

function ensureInit(): boolean {
  if (_initialized) return true;
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const contact = process.env["VAPID_CONTACT"] ?? "mailto:admin@zaboni.com";
  if (!publicKey || !privateKey) {
    logger.warn("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not configured — web push disabled");
    return false;
  }
  webpush.setVapidDetails(contact, publicKey, privateKey);
  _initialized = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] ?? null;
}

export async function sendWebPushToRestaurant(
  restaurantId: string,
  payload: { title: string; body: string },
): Promise<void> {
  if (!ensureInit()) return;

  const subs = await db
    .select()
    .from(restaurantPushSubscriptionsTable)
    .where(eq(restaurantPushSubscriptionsTable.restaurantId, restaurantId));

  if (subs.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadStr,
      ),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await db
          .delete(restaurantPushSubscriptionsTable)
          .where(eq(restaurantPushSubscriptionsTable.endpoint, subs[i]!.endpoint))
          .catch(() => {});
        logger.debug({ endpoint: subs[i]!.endpoint }, "Removed expired push subscription");
      }
    }
  }

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    logger.warn({ restaurantId, failed, total: subs.length }, "Some web push notifications failed");
  }
}
