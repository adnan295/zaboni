import { Expo } from "expo-server-sdk";
import { db, usersTable } from "@workspace/db";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { sendFcmNotification, isFcmConfigured } from "./firebase";
import { sendApnsNotifications, isApnsConfigured } from "./apns";
import { logger } from "./logger";

const expo = new Expo();

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
    ...(data ? { data } : {}),
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === "ok") out.success++;
        else out.failure++;
      }
    } catch {
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

async function clearInvalidTokens(opts: { fcm?: string[]; apns?: string[] }): Promise<void> {
  try {
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

  if (isFcmConfigured() && tokens.fcm.length > 0) {
    tasks.push(
      sendFcmNotification(tokens.fcm, title, body, data).then(async (r) => {
        totals.fcm.success = r.success;
        totals.fcm.failure = r.failure;
        if (r.invalidTokens.length > 0) {
          await clearInvalidTokens({ fcm: r.invalidTokens });
        }
      }),
    );
  }

  if (isApnsConfigured() && tokens.apns.length > 0) {
    tasks.push(
      sendApnsNotifications(tokens.apns, title, body, data).then(async (r) => {
        totals.apns.success = r.success;
        totals.apns.failure = r.failure;
        if (r.invalidTokens.length > 0) {
          await clearInvalidTokens({ apns: r.invalidTokens });
        }
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
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushTotals> {
  const tokens = await loadTokensForUserIds(userIds);
  return sendToTokens(tokens, title, body, data);
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
