import { createServer } from "http";
import app from "./app";
import { startOrderExpiryJob } from "./lib/orderExpiry";
import { logger } from "./lib/logger";
import { backfillRestaurantPhones } from "@workspace/db/migrations/backfill-restaurant-phones";
import { addMenuItemSubcategory } from "@workspace/db/migrations/add-menu-item-subcategory";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  startOrderExpiryJob();
  backfillRestaurantPhones().catch((e) =>
    logger.error({ err: e }, "Failed to backfill restaurant phones"),
  );
  addMenuItemSubcategory().catch((e) =>
    logger.error({ err: e }, "Failed to add menu item subcategory columns"),
  );
});
