# Push Notifications Implementation Guide
## Expo + Express + React Native (Replit)

This guide documents everything needed to implement push notifications in a Replit Expo/React Native app with an Express backend. It covers Android (FCM), iOS (direct APNs), and in-app notification storage.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Required Packages](#2-required-packages)
3. [Android Setup — Firebase FCM](#3-android-setup--firebase-fcm)
4. [iOS Setup — Apple Developer Portal](#4-ios-setup--apple-developer-portal)
5. [Replit Secrets](#5-replit-secrets)
6. [Database Schema](#6-database-schema)
7. [Backend — Firebase FCM Module](#7-backend--firebase-fcm-module)
8. [Backend — Direct APNs Module](#8-backend--direct-apns-module)
9. [Backend — API Routes](#9-backend--api-routes)
10. [Frontend — Push Notification Library](#10-frontend--push-notification-library)
11. [Frontend — Root Layout Integration](#11-frontend--root-layout-integration)
12. [app.json Configuration](#12-appjson-configuration)
13. [In-App Notification Storage](#13-in-app-notification-storage)
14. [Triggering Notifications from the Server](#14-triggering-notifications-from-the-server)
15. [Critical Bugs We Hit and How We Fixed Them](#15-critical-bugs-we-hit-and-how-we-fixed-them)
16. [Debugging Checklist](#16-debugging-checklist)

---

## 1. Architecture Overview

```
User Device
  ├── iOS  → getDevicePushTokenAsync() → APN device token (hex, 64 chars)
  └── Android → getDevicePushTokenAsync() → FCM registration token

All tokens are saved to your Express backend → PostgreSQL

When you want to notify users:
  Server
    ├── iOS users  → Direct HTTP/2 POST to api.push.apple.com (no Expo, no Firebase)
    └── Android users → Firebase Admin SDK → FCM → device
```

### Why NOT rely on Expo's push service for iOS in Replit?

When you publish an Expo app through Replit's Expo Launch, the app is signed under a Replit-managed private Expo account. You cannot log into this account on expo.dev to upload your APNs credentials. Without credentials uploaded to Expo, the Expo push service cannot deliver iOS notifications.

The solution is to bypass Expo's push service for iOS entirely and communicate directly with Apple's APNs servers using HTTP/2 from your Express backend.

Android works through Firebase Admin SDK directly — no Expo push service needed there either.

---

## 2. Required Packages

### Frontend (Expo app)

```bash
npx expo install expo-notifications expo-constants
```

`expo-notifications` is the only new package needed on the frontend. `expo-constants` is usually already present.

### Backend (Express server)

```bash
npm install firebase-admin jsonwebtoken
npm install --save-dev @types/jsonwebtoken
```

- `firebase-admin` — Google's Admin SDK for sending FCM notifications to Android devices
- `jsonwebtoken` — Signs the JWT token required by Apple's APNs HTTP/2 API
- Node's built-in `http2` module is used for APNs — no extra package needed

---

## 3. Android Setup — Firebase FCM

### Step 1: Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it → create
3. In Project Settings → **General** tab → scroll to **Your apps**
4. Click the Android icon → register your app with the Android package name (from `app.json` `android.package`, e.g., `com.yourapp`)
5. Download `google-services.json` → place it at the root of your Replit project

### Step 2: Get Firebase Admin credentials for your server

1. In Firebase Console → Project Settings → **Service accounts** tab
2. Click **Generate new private key** → download the JSON file
3. From that JSON, you need three values:
   - `project_id` → set as `FIREBASE_PROJECT_ID` secret
   - `client_email` → set as `FIREBASE_CLIENT_EMAIL` secret
   - `private_key` → set as `FIREBASE_PRIVATE_KEY` secret (the full multi-line key including `-----BEGIN PRIVATE KEY-----`)

---

## 4. iOS Setup — Apple Developer Portal

### Step 1: Enable Push Notifications capability

1. Go to [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles
2. Under **Identifiers**, click your App ID (matches `ios.bundleIdentifier` in app.json)
3. Enable **Push Notifications** → Save

### Step 2: Create an APNs Authentication Key (.p8)

APNs Authentication Keys are preferred over certificates because they never expire.

1. In the Apple Developer portal → **Keys** → click the + button
2. Name it (e.g., "APNs Key"), check **Apple Push Notifications service (APNs)**
3. Click Continue → Register → **Download the .p8 file** (you can only download it once)
4. Also note the **Key ID** shown on the page (10 characters, e.g., `ABC1234DEF`)
5. Your **Team ID** is shown in the top-right of the developer portal (10 characters)

### Step 3: Store the .p8 content as a secret

Open the .p8 file in a text editor. It looks like this:

```
-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
(more base64 lines)
-----END PRIVATE KEY-----
```

Copy the entire file content (including the BEGIN/END lines) and store it as the `APN_KEY` secret.

**Important:** Copy it exactly — do not modify the formatting. Replit stores multi-line secrets correctly.

---

## 5. Replit Secrets

Set these in your Replit project's Secrets panel:

| Secret Name | Value | Used for |
|---|---|---|
| `FIREBASE_PROJECT_ID` | From Firebase service account JSON | Android FCM |
| `FIREBASE_CLIENT_EMAIL` | From Firebase service account JSON | Android FCM |
| `FIREBASE_PRIVATE_KEY` | From Firebase service account JSON (full PEM including `-----BEGIN...`) | Android FCM |
| `APN_KEY` | Full content of the .p8 file from Apple | iOS direct APNs |
| `APN_KEY_ID` | 10-character Key ID from Apple Developer portal | iOS direct APNs |
| `APPLE_TEAM_ID` | 10-character Team ID from Apple Developer portal | iOS direct APNs |
| `APN_BUNDLE_ID` | (Optional) override for bundle ID, default: value from app.json | iOS direct APNs |

---

## 6. Database Schema

Add three columns to your `users` table (Drizzle ORM):

```typescript
// shared/schema.ts
export const users = pgTable("users", {
  // ... your existing columns ...
  pushToken: text("push_token"),   // Expo push token (ExponentPushToken[xxx]) — used if Expo push works
  fcmToken:  text("fcm_token"),    // Android FCM device token — 150+ chars
  apnToken:  text("apn_token"),    // iOS APNs device token — 64 hex chars
});
```

For in-app notification history (optional but recommended — shows a notification bell/list in the app):

```typescript
export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),         // e.g. "new_campaign", "you_won", "shipping_update"
  title: text("title").notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  campaignId: varchar("campaign_id"),   // optional link to a campaign
  metadata: text("metadata"),           // optional JSON string for extra data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

Run `npm run db:push` after changing the schema to apply changes.

---

## 7. Backend — Firebase FCM Module

Create `server/firebase.ts`:

```typescript
import admin from "firebase-admin";

let initialized = false;

function initFirebase() {
  if (initialized || admin.apps.length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Replace literal \n with real newlines — Replit may escape them
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[Firebase] Missing credentials — FCM disabled.");
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  initialized = true;
  console.log("[Firebase] Admin SDK initialized for project:", projectId);
}

initFirebase();

export type FcmResult = { success: number; failure: number; errors: string[] };

export async function sendFcmNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<FcmResult> {
  const result: FcmResult = { success: 0, failure: 0, errors: [] };

  if (!initialized && admin.apps.length === 0) {
    result.errors.push("Firebase not initialized");
    result.failure = tokens.length;
    return result;
  }

  const validTokens = tokens.filter((t) => typeof t === "string" && t.length > 10);
  if (validTokens.length === 0) return result;

  // FCM allows max 500 tokens per request
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
            icon: "notification_icon",
            color: "#FFD000",
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
          result.errors.push(`Token[${i + idx}]: ${r.error.message}`);
        }
      });
    } catch (err: any) {
      result.failure += chunk.length;
      result.errors.push(err.message || "Unknown error");
    }
  }

  return result;
}
```

---

## 8. Backend — Direct APNs Module

Create `server/apns.ts`. This sends notifications directly to Apple's servers over HTTP/2, bypassing Expo entirely.

```typescript
import http2 from "http2";
import jwt from "jsonwebtoken";

const APN_HOST = "api.push.apple.com";
const BUNDLE_ID = process.env.APN_BUNDLE_ID || "com.your.bundleid"; // match app.json
const REQUEST_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 8_000;

let cachedToken: string | null = null;
let tokenGeneratedAt = 0;

/**
 * Robustly parses the .p8 PEM key stored as a secret.
 * Handles: escaped \n, Windows line endings, and single-line storage.
 * A .p8 key MUST have real newlines between the BEGIN/END markers and the
 * base64 body. If the secret was pasted as a single line, jwt.sign() will
 * throw "secretOrPrivateKey must be an asymmetric key when using ES256".
 * This function reconstructs proper PEM format regardless of how it was stored.
 */
function parseKey(raw: string): string {
  let key = raw.replace(/\\n/g, "\n").replace(/\\r/g, "").trim();

  const beginMatch = key.match(/-----BEGIN [A-Z ]+-----/);
  const endMatch   = key.match(/-----END [A-Z ]+-----/);

  if (!beginMatch || !endMatch) return key;

  const beginIdx = key.indexOf(beginMatch[0]) + beginMatch[0].length;
  const endIdx   = key.indexOf(endMatch[0]);
  const body     = key.slice(beginIdx, endIdx).replace(/[\s\n\r]+/g, "");
  const wrapped  = body.match(/.{1,64}/g)?.join("\n") || body;

  return `${beginMatch[0]}\n${wrapped}\n${endMatch[0]}\n`;
}

function getJWT(): string {
  const now = Date.now();
  // Reuse token for up to 45 minutes (Apple allows tokens up to 1 hour)
  if (cachedToken && now - tokenGeneratedAt < 45 * 60 * 1000) {
    return cachedToken;
  }

  const rawKey = process.env.APN_KEY;
  const keyId  = process.env.APN_KEY_ID?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!rawKey || !keyId || !teamId) {
    throw new Error("[APNs] Missing credentials: APN_KEY, APN_KEY_ID, APPLE_TEAM_ID");
  }

  const key = parseKey(rawKey);

  if (!key.includes("-----BEGIN") || !key.includes("-----END")) {
    throw new Error("[APNs] APN_KEY is not a valid PEM key — paste the full .p8 file including BEGIN/END lines");
  }

  cachedToken = jwt.sign({}, key, {
    algorithm: "ES256",
    keyid: keyId,
    issuer: teamId,
    expiresIn: "1h",
  });
  tokenGeneratedAt = now;
  console.log(`[APNs] JWT generated for team=${teamId} keyId=${keyId}`);
  return cachedToken;
}

export function isApnsConfigured(): boolean {
  return !!(process.env.APN_KEY && process.env.APN_KEY_ID && process.env.APPLE_TEAM_ID);
}

export type ApnsResult = {
  success: number;
  failure: number;
  invalidTokens: string[]; // tokens Apple rejected — should be removed from DB
};

export async function sendApnsNotifications(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<ApnsResult> {
  const result: ApnsResult = { success: 0, failure: 0, invalidTokens: [] };

  const validTokens = [...new Set(deviceTokens.filter((t) => typeof t === "string" && t.length > 20))];
  if (validTokens.length === 0) return result;

  let token: string;
  try {
    token = getJWT();
  } catch (err: any) {
    console.error("[APNs]", err.message);
    result.failure = validTokens.length;
    return result;
  }

  // apns-expiration: Unix timestamp — how long Apple queues the notification for offline devices.
  // "0" means drop immediately if device is offline. Always set to a future time.
  const expirationTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours

  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
    },
    ...(data || {}),
  });

  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session | null = null;
    let pending = validTokens.length;
    let resolved = false;

    // Overall safety timeout
    const overallTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        result.failure += pending;
        try { client?.destroy(); } catch {}
        resolve(result);
      }
    }, CONNECT_TIMEOUT_MS + REQUEST_TIMEOUT_MS * validTokens.length + 2000);

    function finish() {
      if (pending > 0) pending--;
      if (pending === 0 && !resolved) {
        resolved = true;
        clearTimeout(overallTimer);
        try { client?.close(); } catch {}
        resolve(result);
      }
    }

    function abortAll(reason: string) {
      if (!resolved) {
        resolved = true;
        clearTimeout(overallTimer);
        console.error(`[APNs] Aborting: ${reason}`);
        result.failure += pending;
        pending = 0;
        try { client?.destroy(); } catch {}
        resolve(result);
      }
    }

    const connectTimer = setTimeout(() => abortAll("Connection timed out"), CONNECT_TIMEOUT_MS);

    try {
      client = http2.connect(`https://${APN_HOST}`, {}, () => clearTimeout(connectTimer));

      client.on("error", (err) => {
        clearTimeout(connectTimer);
        abortAll(`Connection error: ${err.message}`);
      });

      for (const deviceToken of validTokens) {
        if (resolved) break;

        try {
          const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${deviceToken}`,
            "authorization": `bearer ${token}`,
            "apns-topic": BUNDLE_ID,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": String(expirationTimestamp),
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(payload)),
          });

          let statusCode = 0;
          let responseBody = "";

          const reqTimer = setTimeout(() => {
            result.failure++;
            req.destroy();
            finish();
          }, REQUEST_TIMEOUT_MS);

          req.on("response", (headers) => { statusCode = headers[":status"] as number; });
          req.on("data", (chunk) => { responseBody += chunk; });

          req.on("end", () => {
            clearTimeout(reqTimer);
            if (statusCode === 200) {
              result.success++;
            } else {
              let reason = "unknown";
              try { reason = JSON.parse(responseBody).reason || "unknown"; } catch {}
              console.error(`[APNs] status=${statusCode} reason=${reason} token=${deviceToken.slice(0, 8)}...`);
              // These tokens are permanently invalid — remove from DB
              if (["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason)) {
                result.invalidTokens.push(deviceToken);
              }
              result.failure++;
            }
            finish();
          });

          req.on("error", (err) => {
            clearTimeout(reqTimer);
            result.failure++;
            finish();
          });

          req.end(payload);
        } catch (reqErr: any) {
          result.failure++;
          finish();
        }
      }
    } catch (connErr: any) {
      clearTimeout(connectTimer);
      abortAll(`Failed to connect: ${connErr.message}`);
    }
  });
}
```

---

## 9. Backend — API Routes

Add these routes to your Express `routes.ts`. Also add the `sendPushNotifications` helper that fires both channels in parallel.

### Storage methods to add first

In your `storage.ts` / database layer:

```typescript
// Get Expo push tokens for a list of user IDs
async getUserPushTokensByIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db.select({ token: users.pushToken })
    .from(users)
    .where(and(inArray(users.id, userIds), isNotNull(users.pushToken)));
  return rows.map(r => r.token).filter(Boolean) as string[];
}

// Get APNs device tokens for a list of user IDs (iOS)
async getUserApnTokensByIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await db.select({ token: users.apnToken })
    .from(users)
    .where(and(inArray(users.id, userIds), isNotNull(users.apnToken)));
  return rows.map(r => r.token).filter(Boolean) as string[];
}

// Save Expo push token
async updateUserPushToken(userId: string, pushToken: string | null): Promise<void> {
  await db.update(users).set({ pushToken }).where(eq(users.id, userId));
}

// Save FCM or APNs token
async updateUserDeviceTokens(
  userId: string,
  tokens: { fcmToken?: string | null; apnToken?: string | null }
): Promise<void> {
  await db.update(users).set(tokens).where(eq(users.id, userId));
}
```

### The sendPushNotifications helper (top of routes.ts, before route registration)

```typescript
import { sendFcmNotification } from "./firebase";
import { sendApnsNotifications, isApnsConfigured } from "./apns";
import { inArray } from "drizzle-orm";

async function sendPushNotifications(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) {
  try {
    const [expoTokens, apnTokens] = await Promise.all([
      storage.getUserPushTokensByIds(userIds),
      isApnsConfigured() ? storage.getUserApnTokensByIds(userIds) : Promise.resolve([] as string[]),
    ]);

    const uniqueExpoTokens = [...new Set(expoTokens)].filter(t => typeof t === "string" && t.length > 10);
    const uniqueApnTokens  = [...new Set(apnTokens)].filter(t => typeof t === "string" && t.length > 20);

    const promises: Promise<any>[] = [];

    if (uniqueExpoTokens.length > 0) {
      promises.push(
        sendFcmNotification(uniqueExpoTokens, title, body, data).then(result => {
          console.log(`[Push/FCM] Sent: ${result.success} success, ${result.failure} failure`);
          if (result.errors.length > 0) {
            result.errors.forEach(e => console.error("[Push/Expo] Error:", e));
          }
        })
      );
    }

    if (uniqueApnTokens.length > 0) {
      promises.push(
        sendApnsNotifications(uniqueApnTokens, title, body, data).then(async (apnsResult) => {
          console.log(`[Push/APNs] Sent: ${apnsResult.success} success, ${apnsResult.failure} failure`);
          // Clean up permanently invalid tokens so they are not sent to again
          if (apnsResult.invalidTokens.length > 0) {
            console.warn(`[Push/APNs] Clearing ${apnsResult.invalidTokens.length} invalid token(s)`);
            await db.update(users)
              .set({ apnToken: null })
              .where(inArray(users.apnToken, apnsResult.invalidTokens))
              .catch(err => console.error("[Push/APNs] Failed to clear invalid tokens:", err));
          }
        })
      );
    }

    await Promise.all(promises);
  } catch (e) {
    console.error("[Push] sendPushNotifications error:", e);
  }
}
```

### Token-saving API endpoints

```typescript
// Save Expo push token (called by all platforms)
app.put("/api/auth/push-token", requireAuth, async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken || typeof pushToken !== "string") {
      return res.status(400).json({ message: "pushToken is required" });
    }
    await storage.updateUserPushToken(req.session.userId!, pushToken);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to save push token" });
  }
});

// Save native device token (FCM for Android, APNs for iOS)
app.put("/api/auth/device-tokens", requireAuth, async (req, res) => {
  try {
    const { fcmToken, apnToken } = req.body;
    await storage.updateUserDeviceTokens(req.session.userId!, {
      ...(fcmToken !== undefined && { fcmToken: fcmToken || null }),
      ...(apnToken !== undefined && { apnToken: apnToken || null }),
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to save device token" });
  }
});
```

---

## 10. Frontend — Push Notification Library

Create `lib/push-notifications.ts`:

```typescript
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiRequest } from "@/lib/query-client";
import { router } from "expo-router";

// How to handle notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  if (Platform.OS === "web") return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  return status as "granted" | "denied" | "undetermined";
}

// Retry wrapper for getDevicePushTokenAsync — it sometimes fails on first attempt
async function getDevicePushTokenWithRetry(retries = 3, delayMs = 1500): Promise<Notifications.DevicePushToken | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await Notifications.getDevicePushTokenAsync();
    } catch (error) {
      console.warn(`[PushNotifications] getDevicePushTokenAsync attempt ${attempt}/${retries} failed:`, error);
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.error("[PushNotifications] Failed to get device token after all retries.");
  return null;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.log("[PushNotifications] Permission not granted.");
    return null;
  }

  // IMPORTANT: Save the native device token FIRST, before trying Expo's service.
  // If Expo's service fails (e.g., missing credentials on expo.dev), we still
  // have the native token saved and can send via FCM/APNs directly.
  const deviceTokenData = await getDevicePushTokenWithRetry();
  if (deviceTokenData) {
    if (Platform.OS === "android") {
      await apiRequest("PUT", "/api/auth/device-tokens", { fcmToken: deviceTokenData.data })
        .catch(err => console.error("[PushNotifications] Failed to save FCM token:", err));
    } else if (Platform.OS === "ios") {
      await apiRequest("PUT", "/api/auth/device-tokens", { apnToken: deviceTokenData.data })
        .catch(err => console.error("[PushNotifications] Failed to save APN token:", err));
    }
  }

  // Try Expo push token as a backup / secondary channel
  let expoToken: string | null = null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    expoToken = tokenData.data;
    await apiRequest("PUT", "/api/auth/push-token", { pushToken: expoToken })
      .catch(err => console.error("[PushNotifications] Failed to save Expo token:", err));
  } catch (error) {
    console.warn("[PushNotifications] Expo push token failed (native token already saved):", error);
  }

  // Create notification channel for Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFD000",
    }).catch(err => console.error("[PushNotifications] Channel setup failed:", err));
  }

  return expoToken;
}

// Handle tapping a notification — navigate to relevant screen
function handleNotificationData(data: Record<string, any> | undefined) {
  if (!data) return;
  if (data.campaignId) router.push(`/campaign/${data.campaignId}`);
  else if (data.orderId) router.push(`/order/${data.orderId}`);
}

// Call once from _layout.tsx — sets up tap listeners
export function setupNotificationHandlers() {
  // Handle tap when app was fully closed (cold start)
  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handleNotificationData(response.notification.request.content.data);
  });

  // Handle tap when app is in background or foreground
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationData(response.notification.request.content.data);
  });

  return () => subscription.remove();
}
```

---

## 11. Frontend — Root Layout Integration

In `app/_layout.tsx`, add a `PushNotificationManager` component that:
- Registers when the user logs in (and re-registers on account switch)
- Re-registers when the app comes back to foreground (catches token refresh)
- Has a cooldown to prevent spamming the server

This component must be **inside** `<AuthProvider>` so it can access the current user.

```typescript
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { setupNotificationHandlers, registerForPushNotifications } from "@/lib/push-notifications";

function PushNotificationManager() {
  const { user } = useAuth();
  const prevUserRef = useRef<string | null>(null);
  const lastRegistrationRef = useRef<number>(0);

  function tryRegister() {
    const now = Date.now();
    // 30-second cooldown to avoid hammering the server
    if (now - lastRegistrationRef.current < 30_000) return;
    lastRegistrationRef.current = now;
    registerForPushNotifications().catch(err =>
      console.error("[PushNotificationManager] Registration failed:", err)
    );
  }

  // Set up notification tap handlers once on mount
  useEffect(() => {
    return setupNotificationHandlers();
  }, []);

  // Register when a user logs in (or when account changes)
  useEffect(() => {
    if (user && prevUserRef.current !== user.id) {
      prevUserRef.current = user.id;
      tryRegister();
    } else if (!user) {
      prevUserRef.current = null;
    }
  }, [user]);

  // Re-register when app returns to foreground (token may have refreshed)
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && user) tryRegister();
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [user]);

  return null;
}
```

Place `<PushNotificationManager />` inside your layout — it must be inside `<AuthProvider>` but outside any screen:

```tsx
<AuthProvider>
  <PushNotificationManager />
  <RootLayoutNav />
</AuthProvider>
```

---

## 12. app.json Configuration

```json
{
  "expo": {
    "notification": {
      "icon": "./assets/images/notification-icon.png",
      "color": "#YOUR_BRAND_COLOR",
      "androidMode": "default"
    },
    "ios": {
      "bundleIdentifier": "com.your.bundle.id",
      "googleServicesFile": "./GoogleService-Info.plist",
      "entitlements": {
        "aps-environment": "production"
      }
    },
    "android": {
      "package": "com.yourpackage",
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#YOUR_BRAND_COLOR",
          "defaultChannel": "default",
          "mode": "production"
        }
      ]
    ]
  }
}
```

Key points:
- `aps-environment: "production"` in iOS entitlements is required for real devices (TestFlight / App Store). Without it, APNs tokens are sandbox tokens and production pushes fail silently.
- `mode: "production"` in the expo-notifications plugin tells Expo to generate production APN tokens.
- `GoogleService-Info.plist` goes in the iOS section for iOS Firebase setup.
- `google-services.json` goes in the Android section for Android Firebase setup.

---

## 13. In-App Notification Storage

To show a notification bell with unread count and a history list, add these storage methods and routes:

### Storage methods

```typescript
async createUserNotification(userId, type, title, body, campaignId?, metadata?) {
  const [n] = await db.insert(userNotifications).values({
    userId, type, title, body,
    campaignId: campaignId || null,
    metadata: metadata || null,
  }).returning();
  return n;
}

async createBulkUserNotifications(userIds, type, title, body, campaignId?, metadata?) {
  if (userIds.length === 0) return;
  await db.insert(userNotifications).values(
    userIds.map(userId => ({ userId, type, title, body, campaignId: campaignId || null, metadata: metadata || null }))
  );
}

async getUserNotifications(userId, limit = 50) {
  return db.select().from(userNotifications)
    .where(eq(userNotifications.userId, userId))
    .orderBy(desc(userNotifications.createdAt))
    .limit(limit);
}

async getUnreadUserNotificationCount(userId) {
  const [r] = await db.select({ count: count() }).from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  return r?.count || 0;
}

async markUserNotificationRead(id, userId) {
  const [r] = await db.update(userNotifications)
    .set({ isRead: true })
    .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)))
    .returning();
  return !!r;
}

async markAllUserNotificationsRead(userId) {
  await db.update(userNotifications)
    .set({ isRead: true })
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  return true;
}
```

### API routes

```typescript
app.get("/api/notifications", requireAuth, async (req, res) => {
  const notifications = await storage.getUserNotifications(req.session.userId!);
  res.json(notifications);
});

app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
  const count = await storage.getUnreadUserNotificationCount(req.session.userId!);
  res.json({ count });
});

app.put("/api/notifications/:id/read", requireAuth, async (req, res) => {
  const success = await storage.markUserNotificationRead(req.params.id, req.session.userId!);
  if (!success) return res.status(404).json({ message: "Not found" });
  res.json({ success: true });
});

app.put("/api/notifications/read-all", requireAuth, async (req, res) => {
  await storage.markAllUserNotificationsRead(req.session.userId!);
  res.json({ success: true });
});
```

### Usage in the frontend

```typescript
// Show unread badge count on a tab
const { data } = useQuery<{ count: number }>({ queryKey: ["/api/notifications/unread-count"] });

// Show notification list
const { data: notifications } = useQuery<UserNotification[]>({ queryKey: ["/api/notifications"] });
```

---

## 14. Triggering Notifications from the Server

Any time something happens that should notify users, call:

```typescript
// Notify specific users
sendPushNotifications(
  [userId1, userId2],          // array of user IDs
  "New Campaign! 🎉",           // title
  "A new product just dropped", // body
  { campaignId: "abc123" }      // optional data — used for deep linking on tap
);

// Also create an in-app record so it shows in the notification list
await storage.createBulkUserNotifications(
  [userId1, userId2],
  "new_campaign",
  "New Campaign! 🎉",
  "A new product just dropped",
  "abc123"  // optional campaignId
);
```

The data payload (`campaignId`, `orderId`, etc.) is passed to `handleNotificationData` on the frontend when the user taps the notification, which navigates to the right screen.

---

## 15. Critical Bugs We Hit and How We Fixed Them

### Bug 1: JWT signing fails with "secretOrPrivateKey must be an asymmetric key when using ES256"

**Root cause:** The `.p8` private key was stored in Replit Secrets either as a single line or with incorrect formatting. PEM keys require real newlines between the `-----BEGIN PRIVATE KEY-----` line, the base64 body (wrapped at 64 chars), and the `-----END PRIVATE KEY-----` line. If the newlines are missing, `jsonwebtoken` cannot parse the EC key.

**Fix:** The `parseKey()` function strips everything between the BEGIN/END markers, removes all whitespace from the base64 body, then re-wraps it at 64 characters per line and reassembles a clean PEM string. This works regardless of how the secret was stored.

### Bug 2: APN token never saved to the database (apn_token = NULL)

**Root cause:** The code called `getExpoPushTokenAsync` first. Since the Expo push service was returning `InvalidCredentials` (the Replit-managed Expo account has no APNs credentials), the try-catch exited before ever reaching `getDevicePushTokenAsync` or the `/api/auth/device-tokens` call.

**Fix:** Moved the native device token fetch (`getDevicePushTokenAsync`) and save to the server to happen **before** the Expo push token attempt. Wrapped the Expo token call in its own try-catch so its failure is logged as a warning but doesn't block anything.

### Bug 3: apns-expiration set to "0" — notifications dropped when device is offline

**Root cause:** The HTTP/2 request header `apns-expiration` was set to `"0"`. A value of 0 tells Apple "do not store this notification — if the device is not reachable right now, drop it." iPhones frequently go offline (airplane mode, asleep, poor connection).

**Fix:** Set `apns-expiration` to `Math.floor(Date.now() / 1000) + 86400` — a Unix timestamp 24 hours in the future. Apple queues the notification and delivers it when the device reconnects.

### Bug 4: Entire push operation hangs if Apple's server is slow

**Root cause:** HTTP/2 connections and requests have no built-in timeout. If `api.push.apple.com` is slow or unreachable, the Promise never resolves.

**Fix:** Three-layered timeout system:
1. `connectTimer` — 8 seconds to establish the HTTP/2 connection
2. `reqTimer` per request — 10 seconds per individual request
3. `overallTimer` — total cap based on number of tokens

### Bug 5: Expo push service does not work for iOS on Replit's managed Expo account

**Root cause:** Replit publishes under a private Expo account (`replit-private-...`). You cannot log into this account on expo.dev, so there is no way to upload your APNs `.p8` key to Expo's push service.

**Fix:** Bypass Expo push service entirely for iOS. Use direct HTTP/2 to Apple's APNs. Android still uses Firebase Admin SDK (FCM), which does not go through Expo.

### Bug 6: expo-notifications `mode` not set to production

**Root cause:** Without `"mode": "production"` in the expo-notifications plugin config, Expo generates sandbox/development APN tokens. Sandbox tokens cannot receive production (App Store / TestFlight) pushes.

**Fix:** Add `"mode": "production"` to the expo-notifications plugin in `app.json`.

### Bug 7: Missing `aps-environment: "production"` iOS entitlement

**Root cause:** Without the `aps-environment: production` entitlement in the iOS app binary, even if you get a device token, Apple's production APNs endpoint rejects it with `DeviceTokenNotForTopic`.

**Fix:** Add to `app.json` under `ios.entitlements`: `"aps-environment": "production"`.

---

## 16. Debugging Checklist

When notifications don't arrive, check these in order:

**Server side — read the production logs:**

| Log line | Meaning |
|---|---|
| `[APNs] JWT generated for team=XXX keyId=YYY` | Key parsed successfully |
| `[Push/APNs] Sent: 1 success, 0 failure` | Working correctly |
| `secretOrPrivateKey must be an asymmetric key` | APN_KEY secret has bad formatting — check parseKey |
| `status=400 reason=BadDeviceToken` | Token is invalid/stale — will be auto-cleared from DB |
| `status=403 reason=InvalidProviderToken` | Key ID or Team ID wrong, or key was revoked |
| `status=400 reason=DeviceTokenNotForTopic` | Bundle ID mismatch or missing aps-environment entitlement |
| `InvalidCredentials` (Expo) | Expected on Replit — APNs handled directly instead |

**Database:**

```sql
-- Check if APN token was saved for a user
SELECT id, email, apn_token FROM users WHERE email = 'user@example.com';
```
If `apn_token` is NULL: the device never called `/api/auth/device-tokens`. Check frontend logs for the `[PushNotifications]` messages.

**Frontend device logs:**

- `[PushNotifications] Got native device token (ios): 28d01d90...` → token obtained
- `[PushNotifications] Failed to save APN token:` → network error saving to server
- `[PushNotifications] Expo push token failed (native token already saved)` → expected on Replit, safe to ignore

**Build requirements:**

Notifications only work in real builds — not in Expo Go. The APN device token is only issued by Apple to properly signed builds. You need a TestFlight or App Store build to test iOS notifications end-to-end.
