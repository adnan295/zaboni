import { Expo } from "expo-server-sdk";
import { db, pool, usersTable, userNotificationsTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { sendFcmNotification, isFcmConfigured } from "./firebase";
import { sendApnsNotifications, isApnsConfigured } from "./apns";
import { logger } from "./logger";

const expo = new Expo({ accessToken: process.env["EXPO_ACCESS_TOKEN"] });

export async function withPushTimeout<T>(work: Promise<T>, ms = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("push_provider_timeout")), ms);
    })]);
  } finally { clearTimeout(timer!); }
}

export type PushTotals = {
  expo: { success: number; failure: number };
  fcm: { success: number; failure: number };
  apns: { success: number; failure: number };
};

function emptyTotals(): PushTotals {
  return {
    expo: { success: 0, failure: 0 },
    fcm: { success: 0, failure: 0 },
    apns: { success: 0, failure: 0 },
  };
}

export function totalsSentCount(t: PushTotals): number {
  return t.expo.success + t.fcm.success + t.apns.success;
}

export function totalsFailedCount(t: PushTotals): number {
  return t.expo.failure + t.fcm.failure + t.apns.failure;
}

async function sendExpo(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ success: number; failure: number }> {
  const out = { success: 0, failure: 0 };
  const valid = [...new Set(tokens.filter((t) => Expo.isExpoPushToken(t)))];
  if (valid.length === 0) return out;

  const messages = valid.map((to) => ({
    to,
    title,
    body,
    sound: "default" as const,
    priority: "high" as const,
    channelId: "default",
    ...(data?.type === "new_order" ? { ttl: 60, collapseId: data.orderId, tag: data.orderId } : {}),
    ...(data ? { data } : {}),
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await withPushTimeout(expo.sendPushNotificationsAsync(chunk));
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]!;
        if (ticket.status === "ok") {
          out.success++;
          // A ticket only means Expo queued the message. Persist it for receipt
          // checking after restarts; never treat it as device delivery.
          try {
            await pool.query(`INSERT INTO push_receipts (id, token, order_id, next_check_at)
              VALUES ($1, $2, $3, NOW() + INTERVAL '15 seconds') ON CONFLICT DO NOTHING`,
            [ticket.id, chunk[i]!.to, data?.orderId ?? null]);
          } catch (err) { logger.error({ err, orderId: data?.orderId }, "Could not persist Expo receipt"); }
        } else {
          out.failure++;
          logger.warn({ code: ticket.details?.error, orderId: data?.orderId }, "Expo push rejected");
          if (ticket.details?.error === "DeviceNotRegistered") {
            await clearInvalidTokens({ expo: [String(chunk[i]!.to)] });
          }
        }
      }
    } catch (err) {
      logger.warn({ err, orderId: data?.orderId }, "Expo push request failed");
      out.failure += chunk.length;
    }
  }
  return out;
}

type Tokens = { expo: string[]; fcm: string[]; apns: string[] };

async function loadTokensForUserIds(userIds: string[]): Promise<Tokens> {
  const result: Tokens = { expo: [], fcm: [], apns: [] };
  if (userIds.length === 0) return result;

  const rows = await db
    .select({
      pushToken: usersTable.pushToken,
      fcmToken: usersTable.fcmToken,
      apnToken: usersTable.apnToken,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  for (const r of rows) {
    if (r.pushToken) result.expo.push(r.pushToken);
    if (r.fcmToken) result.fcm.push(r.fcmToken);
    if (r.apnToken) result.apns.push(r.apnToken);
  }
  return result;
}

async function clearInvalidTokens(opts: { fcm?: string[]; apns?: string[]; expo?: string[] }): Promise<void> {
  try {
    if (opts.expo?.length) {
      await db.update(usersTable).set({ pushToken: null }).where(inArray(usersTable.pushToken, opts.expo));
    }
    if (opts.fcm && opts.fcm.length > 0) {
      await db.update(usersTable).set({ fcmToken: null }).where(inArray(usersTable.fcmToken, opts.fcm));
    }
    if (opts.apns && opts.apns.length > 0) {
      await db.update(usersTable).set({ apnToken: null }).where(inArray(usersTable.apnToken, opts.apns));
    }
  } catch (err) {
    logger.warn({ err }, "[Push] Failed to clear invalid tokens");
  }
}

async function sendToTokens(
  tokens: Tokens,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushTotals> {
  const totals = emptyTotals();

  const tasks: Array<Promise<void>> = [];

  if (tokens.expo.length > 0) {
    tasks.push(
      sendExpo(tokens.expo, title, body, data).then((r) => {
        totals.expo = r;
      }),
    );
  }

  if (tokens.fcm.length > 0) {
    tasks.push(
      withPushTimeout(sendFcmNotification(tokens.fcm, title, body, data)).then(async (r) => {
        if (r.errors.length) logger.warn({ errors: r.errors, orderId: data?.orderId }, "FCM push failed");
        totals.fcm.success = r.success;
        totals.fcm.failure = r.failure;
        if (r.invalidTokens.length > 0) {
          await clearInvalidTokens({ fcm: r.invalidTokens });
        }
      }).catch((err) => {
        totals.fcm.failure = tokens.fcm.length;
        logger.warn({ err, orderId: data?.orderId }, "FCM request failed");
      }),
    );
  }

  if (tokens.apns.length > 0) {
    tasks.push(
      withPushTimeout(sendApnsNotifications(tokens.apns, title, body, data)).then(async (r) => {
        totals.apns.success = r.success;
        totals.apns.failure = r.failure;
        if (r.invalidTokens.length > 0) {
          await clearInvalidTokens({ apns: r.invalidTokens });
        }
      }).catch((err) => {
        totals.apns.failure = tokens.apns.length;
        logger.warn({ err, orderId: data?.orderId }, "APNs request failed");
      }),
    );
  }

  await Promise.all(tasks);
  return totals;
}

/**
 * Send a push notification to specific users across every channel
 * (Expo + FCM + APNs in parallel).
 */
async function persistUserNotifications(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (userIds.length === 0) return;
  const type = (() => {
    const t = data?.type;
    if (t === "order_update" || t === "new_order") return "order_status" as const;
    if (t === "flash_deal") return "promo" as const;
    if (t === "chat_message") return "system" as const;
    return "system" as const;
  })();
  const orderId = data?.orderId ?? undefined;
  const rows = userIds.map((userId) => ({
    id: `un_${Date.now()}${Math.random().toString(36).slice(2, 8)}_${userId.slice(-4)}`,
    userId,
    title,
    body,
    type,
    orderId: orderId ?? null,
  }));
  try {
    await db.insert(userNotificationsTable).values(rows);
  } catch (e) {
    logger.warn({ err: e }, "Failed to persist user notifications");
  }
}

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushTotals> {
  const tokens = await loadTokensForUserIds(userIds);
  const totals = await sendToTokens(tokens, title, body, data);
  await persistUserNotifications(userIds, title, body, data);
  return totals;
}

/**
 * Send a push notification to all users matching an optional role filter.
 */
export async function sendPushToRole(
  target: "all" | "customers" | "couriers",
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushTotals> {
  const hasAnyToken = or(
    isNotNull(usersTable.pushToken),
    isNotNull(usersTable.fcmToken),
    isNotNull(usersTable.apnToken),
  );

  const where =
    target === "customers"
      ? and(eq(usersTable.role, "customer"), hasAnyToken)
      : target === "couriers"
        ? and(eq(usersTable.role, "courier"), hasAnyToken)
        : hasAnyToken;

  const rows = await db
    .select({
      pushToken: usersTable.pushToken,
      fcmToken: usersTable.fcmToken,
      apnToken: usersTable.apnToken,
    })
    .from(usersTable)
    .where(where);
  const tokens: Tokens = { expo: [], fcm: [], apns: [] };
  for (const r of rows) {
    if (r.pushToken) tokens.expo.push(r.pushToken);
    if (r.fcmToken) tokens.fcm.push(r.fcmToken);
    if (r.apnToken) tokens.apns.push(r.apnToken);
  }

  return sendToTokens(tokens, title, body, data);
}

/**
 * Returns true when a flash deal warrants an immediate customer push notification:
 * - isActive=true (deal is live right now), OR
 * - startsAt is within the next SOON_HOURS hours (deal starts very soon, even if not yet active)
 */
const SOON_HOURS = 2;
export function isFlashDealImminent(isActive: boolean, startsAt: Date): boolean {
  if (isActive) return true;
  const now = Date.now();
  const starts = startsAt.getTime();
  return starts > now && starts - now <= SOON_HOURS * 60 * 60 * 1000;
}

/**
 * Send a push notification to all customers (role="customer").
 * Persists to user_notifications so they appear in the in-app notification list.
 */
export async function sendPushToAllCustomers(
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushTotals> {
  const customers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "customer"));
  const userIds = customers.map((c) => c.id);
  if (userIds.length === 0) return emptyTotals();
  return sendPushToUsers(userIds, title, body, data);
}

/**
 * Send a push notification using already-collected tokens (no DB round-trip).
 * Used by hot paths like courier broadcast where the caller already has a filtered list.
 */
export async function sendPushToTokens(
  tokens: Partial<Tokens>,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushTotals> {
  return sendToTokens(
    {
      expo: tokens.expo ?? [],
      fcm: tokens.fcm ?? [],
      apns: tokens.apns ?? [],
    },
    title,
    body,
    data,
  );
}


/** Prefer a native alert; use Expo only if native submission fails/unavailable. */
export async function sendCourierPush(
  devices: Array<{ pushToken: string | null; fcmToken: string | null; apnToken: string | null }>,
  title: string, body: string, data: Record<string, string>,
  stillSearching: () => Promise<boolean> = async () => true,
): Promise<{ accepted: number; failed: number }> {
  let accepted = 0, failed = 0;
  // Batches keep connections bounded without serializing every courier.
  for (let offset = 0; offset < devices.length; offset += 20) {
    if (!(await stillSearching())) break;
    await Promise.all(devices.slice(offset, offset + 20).map(async device => {
      const native = await sendPushToTokens({
        fcm: device.fcmToken && isFcmConfigured() ? [device.fcmToken] : [],
        apns: device.apnToken && isApnsConfigured() ? [device.apnToken] : [],
      }, title, body, data);
      if (totalsSentCount(native) > 0) { accepted++; return; }
      if (device.pushToken) {
        const fallback = await sendPushToTokens({ expo: [device.pushToken] }, title, body, data);
        if (totalsSentCount(fallback) > 0) { accepted++; return; }
      }
      failed++;
    }));
  }
  if (failed) logger.warn({ orderId: data.orderId, accepted, failed,
    fcmConfigured: isFcmConfigured(), apnsConfigured: isApnsConfigured() }, "Courier push submission incomplete");
  return { accepted, failed };
}

let checkingReceipts = false;
export async function checkPushReceipts(): Promise<void> {
  if (checkingReceipts) return;
  checkingReceipts = true;
  try {
    const pending = await pool.query(`SELECT id, token, order_id, created_at FROM push_receipts
      WHERE next_check_at <= NOW() ORDER BY next_check_at LIMIT 100`);
    if (!pending.rows.length) return;
    const receipts = await withPushTimeout(expo.getPushNotificationReceiptsAsync(pending.rows.map(r => r.id)));
    for (const row of pending.rows) {
      const receipt = receipts[row.id];
      const expired = Date.now() - new Date(row.created_at).getTime() >= 24 * 60 * 60_000;
      if (!receipt && !expired) {
        await pool.query("UPDATE push_receipts SET next_check_at = NOW() + INTERVAL '1 minute' WHERE id = $1", [row.id]);
        continue;
      }
      if (receipt?.status === "error" || expired) {
        logger.error({ orderId: row.order_id, receiptId: row.id,
          code: receipt?.status === "error" ? receipt.details?.error : "receipt_missing" }, "Expo delivery to provider failed");
        if (receipt?.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          await clearInvalidTokens({ expo: [row.token] });
        }
        if (row.order_id) await pool.query(
          "UPDATE order_dispatch SET next_attempt_at = NOW(), last_error = 'expo_receipt_failed' WHERE order_id = $1", [row.order_id]);
      }
      await pool.query("DELETE FROM push_receipts WHERE id = $1", [row.id]);
    }
  } catch (err) { logger.error({ err }, "Expo receipt check failed; will retry"); }
  finally { checkingReceipts = false; }
}

export function startPushReceiptJob(): void {
  void checkPushReceipts();
  setInterval(() => void checkPushReceipts(), 15_000).unref();
}
