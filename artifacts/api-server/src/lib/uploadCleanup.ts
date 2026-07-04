import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function cleanPublicUploads(): Promise<void> {
  const service = new ObjectStorageService();
  try {
    const { scanned, deleted } = await service.scanAndCleanPublicUploads();
    if (deleted > 0) {
      logger.warn({ scanned, deleted }, "Upload cleanup: removed non-conforming public uploads");
    } else {
      logger.info({ scanned }, "Upload cleanup: all public uploads passed validation");
    }
  } catch (err) {
    logger.error({ err }, "Upload cleanup job failed");
  }
}

export function startUploadCleanupJob(): void {
  logger.info("Starting public upload cleanup job");
  cleanPublicUploads();
  setInterval(cleanPublicUploads, CHECK_INTERVAL_MS);
}
