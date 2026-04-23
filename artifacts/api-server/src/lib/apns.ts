import http2 from "http2";
import jwt from "jsonwebtoken";
import { logger } from "./logger";

const APN_HOST = "api.push.apple.com";
const REQUEST_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 8_000;
const TOKEN_TTL_MS = 45 * 60 * 1000;

function getBundleId(): string {
  return process.env["APN_BUNDLE_ID"] || "com.marsool.delivery";
}

let cachedToken: string | null = null;
let tokenGeneratedAt = 0;

function parseKey(raw: string): string {
  let key = raw.replace(/\\n/g, "\n").replace(/\\r/g, "").trim();

  const beginMatch = key.match(/-----BEGIN [A-Z ]+-----/);
  const endMatch = key.match(/-----END [A-Z ]+-----/);

  if (!beginMatch || !endMatch) return key;

  const beginIdx = key.indexOf(beginMatch[0]) + beginMatch[0].length;
  const endIdx = key.indexOf(endMatch[0]);
  const body = key.slice(beginIdx, endIdx).replace(/[\s\n\r]+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;

  return `${beginMatch[0]}\n${wrapped}\n${endMatch[0]}\n`;
}

function getJWT(): string {
  const now = Date.now();
  if (cachedToken && now - tokenGeneratedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const rawKey = process.env["APN_KEY"];
  const keyId = process.env["APN_KEY_ID"]?.trim();
  const teamId = process.env["APPLE_TEAM_ID"]?.trim();

  if (!rawKey || !keyId || !teamId) {
    throw new Error("[APNs] Missing credentials: APN_KEY, APN_KEY_ID, APPLE_TEAM_ID");
  }

  const key = parseKey(rawKey);
  if (!key.includes("-----BEGIN") || !key.includes("-----END")) {
    throw new Error("[APNs] APN_KEY is not a valid PEM key — paste the full .p8 content including BEGIN/END lines");
  }

  cachedToken = jwt.sign({}, key, {
    algorithm: "ES256",
    keyid: keyId,
    issuer: teamId,
    expiresIn: "1h",
  });
  tokenGeneratedAt = now;
  logger.info({ teamId, keyId }, "[APNs] JWT generated");
  return cachedToken;
}

export function isApnsConfigured(): boolean {
  return !!(process.env["APN_KEY"] && process.env["APN_KEY_ID"] && process.env["APPLE_TEAM_ID"]);
}

export type ApnsResult = {
  success: number;
  failure: number;
  invalidTokens: string[];
};

export async function sendApnsNotifications(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<ApnsResult> {
  const result: ApnsResult = { success: 0, failure: 0, invalidTokens: [] };

  const validTokens = [...new Set(deviceTokens.filter((t) => typeof t === "string" && t.length > 20))];
  if (validTokens.length === 0) return result;

  let token: string;
  try {
    token = getJWT();
  } catch (err) {
    logger.error({ err }, "[APNs] Failed to sign JWT");
    result.failure = validTokens.length;
    return result;
  }

  const expirationTimestamp = Math.floor(Date.now() / 1000) + 86400;

  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
    },
    ...(data || {}),
  });

  const bundleId = getBundleId();

  return new Promise((resolve) => {
    let client: http2.ClientHttp2Session | null = null;
    let pending = validTokens.length;
    let resolved = false;

    const overallTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        result.failure += pending;
        try { client?.destroy(); } catch { /* noop */ }
        resolve(result);
      }
    }, CONNECT_TIMEOUT_MS + REQUEST_TIMEOUT_MS * validTokens.length + 2000);

    function finish(): void {
      if (pending > 0) pending--;
      if (pending === 0 && !resolved) {
        resolved = true;
        clearTimeout(overallTimer);
        try { client?.close(); } catch { /* noop */ }
        resolve(result);
      }
    }

    function abortAll(reason: string): void {
      if (!resolved) {
        resolved = true;
        clearTimeout(overallTimer);
        logger.error(`[APNs] Aborting: ${reason}`);
        result.failure += pending;
        pending = 0;
        try { client?.destroy(); } catch { /* noop */ }
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
            "apns-topic": bundleId,
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
              try { reason = JSON.parse(responseBody).reason || "unknown"; } catch { /* noop */ }
              logger.warn({ statusCode, reason, tokenPrefix: deviceToken.slice(0, 8) }, "[APNs] Push rejected");
              if (["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(reason)) {
                result.invalidTokens.push(deviceToken);
              }
              result.failure++;
            }
            finish();
          });

          req.on("error", () => {
            clearTimeout(reqTimer);
            result.failure++;
            finish();
          });

          req.end(payload);
        } catch {
          result.failure++;
          finish();
        }
      }
    } catch (connErr) {
      clearTimeout(connectTimer);
      const msg = connErr instanceof Error ? connErr.message : "Unknown connect error";
      abortAll(`Failed to connect: ${msg}`);
    }
  });
}
