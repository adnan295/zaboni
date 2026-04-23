import admin from "firebase-admin";
import { logger } from "./logger";

let initialized = false;

function initFirebase(): void {
  if (initialized || admin.apps.length > 0) {
    initialized = true;
    return;
  }

  const projectId = process.env["FIREBASE_PROJECT_ID"];
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"]?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn("[Firebase] Missing FIREBASE_* credentials — FCM disabled.");
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    initialized = true;
    logger.info({ projectId }, "[Firebase] Admin SDK initialized");
  } catch (err) {
    logger.error({ err }, "[Firebase] Failed to initialize Admin SDK");
  }
}

initFirebase();

export function isFcmConfigured(): boolean {
  return initialized || admin.apps.length > 0;
}

export type FcmResult = {
  success: number;
  failure: number;
  invalidTokens: string[];
  errors: string[];
};

export async function sendFcmNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<FcmResult> {
  const result: FcmResult = { success: 0, failure: 0, invalidTokens: [], errors: [] };

  if (!isFcmConfigured()) {
    result.errors.push("Firebase Admin SDK not initialized");
    result.failure = tokens.length;
    return result;
  }

  const validTokens = [...new Set(tokens.filter((t) => typeof t === "string" && t.length > 10))];
  if (validTokens.length === 0) return result;

  const CHUNK = 500;
  for (let i = 0; i < validTokens.length; i += CHUNK) {
    const chunk = validTokens.slice(i, i + CHUNK);
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: data || {},
        android: {
          priority: "high",
          notification: {
            channelId: "default",
            sound: "default",
            color: "#DC2626",
          },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
          headers: { "apns-priority": "10" },
        },
      });
      result.success += response.successCount;
      result.failure += response.failureCount;
      response.responses.forEach((r, idx) => {
        if (!r.success && r.error) {
          const code = r.error.code || "";
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            result.invalidTokens.push(chunk[idx]!);
          }
          result.errors.push(`${code}: ${r.error.message}`);
        }
      });
    } catch (err) {
      result.failure += chunk.length;
      const msg = err instanceof Error ? err.message : "Unknown FCM error";
      result.errors.push(msg);
    }
  }

  return result;
}
