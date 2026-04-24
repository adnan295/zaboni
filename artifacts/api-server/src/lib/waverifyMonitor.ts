import { checkHealth, isWaVerifyConfigured } from "./waverify";
import { logger } from "./logger";
import { db, waverifyHealthLogTable, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const WEBHOOK_TIMEOUT_MS = 10_000;

let lastHealthy: boolean | null = null;
let alertSent = false;

async function getAlertWebhookUrl(): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "alert_webhook_url"));
    const dbValue = rows[0]?.value?.trim();
    if (dbValue) return dbValue;
  } catch {
  }
  return process.env["ADMIN_ALERT_WEBHOOK_URL"] ?? null;
}

export async function sendAdminAlertWebhook(
  webhookUrl: string,
  message: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, message }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { status: res.status, body },
        "Admin alert webhook responded with error",
      );
      return false;
    }
    logger.info("Admin alert sent via webhook");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send admin alert via webhook");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendAdminAlert(message: string): Promise<boolean> {
  const webhookUrl = await getAlertWebhookUrl();
  if (!webhookUrl) {
    logger.warn("No alert webhook URL configured — skipping alert delivery");
    return true;
  }
  return sendAdminAlertWebhook(webhookUrl, message);
}

async function pollWaVerify(): Promise<void> {
  if (!isWaVerifyConfigured()) {
    return;
  }

  const health = await checkHealth();
  const isHealthy = health.ok;

  db.insert(waverifyHealthLogTable).values({
    ok: health.ok,
    httpStatus: health.status ?? null,
    message: health.message ?? null,
  }).catch((err) => {
    logger.warn({ err }, "Failed to persist WaVerify health log entry");
  });

  if (lastHealthy === null) {
    lastHealthy = isHealthy;
    alertSent = false;
    logger.info({ isHealthy, message: health.message }, "WaVerify initial health state");
    return;
  }

  if (lastHealthy && !isHealthy && !alertSent) {
    const alertMsg = `[مرسول] تنبيه: انقطع اتصال WaVerify\nالسبب: ${health.message}`;
    logger.warn({ message: health.message }, "WaVerify connection lost — sending admin alert");
    const delivered = await sendAdminAlert(alertMsg);
    if (delivered) {
      alertSent = true;
    }
  }

  if (!lastHealthy && isHealthy) {
    alertSent = false;
    logger.info("WaVerify connection restored");
  }

  lastHealthy = isHealthy;
}

export function startWaVerifyMonitor(): void {
  if (!isWaVerifyConfigured()) {
    logger.info("WaVerify not configured — skipping monitor");
    return;
  }

  logger.info({ intervalMs: POLL_INTERVAL_MS }, "WaVerify monitor started");

  void pollWaVerify();

  setInterval(() => {
    void pollWaVerify();
  }, POLL_INTERVAL_MS);
}
