// Nightly backups run in the separate `backup` container (docker/backup), which
// writes its result to a shared volume. This reads it for the admin dashboard
// and alerts over WhatsApp when backups fail or stop.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";
import { getCrashAlertPhone } from "./crashReports";
import { whatsappManager } from "./whatsapp";

export interface BackupStatus {
  configured: boolean;
  status: "ok" | "failed" | "never";
  at: string | null;
  lastSuccessAt: string | null;
  message: string;
  dbBytes: number;
  /** Hours since the last successful backup (null if never). */
  ageHours: number | null;
  healthy: boolean;
}

const STATUS_FILE = path.join(process.env["BACKUP_STATUS_DIR"] ?? "/backup-status", "last.json");
/** A nightly job; allow a missed run's retry window before calling it stale. */
export const STALE_AFTER_HOURS = 26;

export async function readBackupStatus(now = Date.now()): Promise<BackupStatus> {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await readFile(STATUS_FILE, "utf8")) as Record<string, unknown>;
  } catch {
    return { configured: false, status: "never", at: null, lastSuccessAt: null, message: "", dbBytes: 0, ageHours: null, healthy: false };
  }
  const lastSuccessAt = typeof raw["lastSuccessAt"] === "string" && raw["lastSuccessAt"] ? (raw["lastSuccessAt"] as string) : null;
  const lastMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  const ageHours = Number.isFinite(lastMs) ? Math.max(0, Math.round(((now - lastMs) / 3_600_000) * 10) / 10) : null;
  const status = raw["status"] === "ok" ? "ok" : raw["status"] === "failed" ? "failed" : "never";
  return {
    configured: true,
    status,
    at: typeof raw["at"] === "string" ? (raw["at"] as string) : null,
    lastSuccessAt,
    message: String(raw["message"] ?? "").slice(0, 300),
    dbBytes: Number(raw["dbBytes"]) || 0,
    ageHours,
    healthy: status === "ok" && ageHours !== null && ageHours < STALE_AFTER_HOURS,
  };
}

let lastAlertAt = 0;
const REALERT_MS = 12 * 3_600_000;

export async function checkBackupsAndAlert(): Promise<void> {
  const s = await readBackupStatus();
  if (!s.configured || s.healthy) return;
  if (Date.now() - lastAlertAt < REALERT_MS) return;
  const phone = (await getCrashAlertPhone()).trim();
  lastAlertAt = Date.now();
  const text = s.status === "failed"
    ? `⚠️ النسخ الاحتياطي لزبوني فشل\n\n${s.message}\n\nآخر نسخة ناجحة: ${s.lastSuccessAt ?? "ولا وحدة"}`
    : `⚠️ ما في نسخة احتياطية لزبوني من ${s.ageHours ?? "؟"} ساعة\n\nتأكد إنو حاوية backup شغّالة: docker compose --profile backup ps`;
  logger.warn({ backup: s }, "[backup] unhealthy");
  if (phone) await whatsappManager.sendMessage(phone, text).catch(() => false);
}

export function startBackupWatchJob(): void {
  const run = () => void checkBackupsAndAlert().catch((err) => logger.warn({ err }, "[backup] status check failed"));
  setTimeout(run, 60_000).unref();
  setInterval(run, 3_600_000).unref();
}
