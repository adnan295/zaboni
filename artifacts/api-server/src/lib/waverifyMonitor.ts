import { checkHealth, isWaVerifyConfigured } from "./waverify";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const WEBHOOK_TIMEOUT_MS = 10_000;

let lastHealthy: boolean | null = null;
let alertSent = false;

async function sendAdminAlert(message: string): Promise<boolean> {
  const webhookUrl = process.env["ADMIN_ALERT_WEBHOOK_URL"];
  if (!webhookUrl) {
    logger.warn("ADMIN_ALERT_WEBHOOK_URL not set — skipping alert delivery");
    return true;
  }

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
        "Admin alert webhook responded with error — will retry next poll",
      );
      return false;
    }
    logger.info("Admin alert sent via webhook");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send admin alert via webhook — will retry next poll");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function pollWaVerify(): Promise<void> {
  if (!isWaVerifyConfigured()) {
    return;
  }

  const health = await checkHealth();
  const isHealthy = health.ok;

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
