import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import app from "./app";
import { setupOrdersNamespace } from "./orders/server";
import { startOrderExpiryJob } from "./lib/orderExpiry";
import { startDealExpiryJob } from "./lib/dealExpiry";
import { startUploadCleanupJob } from "./lib/uploadCleanup";
import { logger } from "./lib/logger";
import { ensurePreviewsExist } from "./lib/promoBannerComposer";
import { backfillRestaurantPhones } from "@workspace/db/migrations/backfill-restaurant-phones";
import { addMenuItemSubcategory } from "@workspace/db/migrations/add-menu-item-subcategory";
import { addRestaurantPortal } from "@workspace/db/migrations/add-restaurant-portal";
import { addPromoImages } from "@workspace/db/migrations/add-promo-images";
import { addPromoImagesTemplate } from "@workspace/db/migrations/add-promo-images-template";
import { addMenuItemAvailability } from "@workspace/db/migrations/add-menu-item-availability";
import { addPromoRestaurant } from "@workspace/db/migrations/add-promo-restaurant";
import { addMenuItemDeals } from "@workspace/db/migrations/add-menu-item-deals";
import { addDealExpiresAt } from "@workspace/db/migrations/add-deal-expires-at";
import { addAdminNotes } from "@workspace/db/migrations/add-admin-notes";
import { addFlashDeals } from "@workspace/db/migrations/add-flash-deals";
import { addLoyalty } from "@workspace/db/migrations/add-loyalty";
import { addUserAchievements } from "@workspace/db/migrations/add-user-achievements";
import { addCustomerSubscriptions } from "@workspace/db/migrations/add-customer-subscriptions";
import { addUserBlocked } from "@workspace/db/migrations/add-user-blocked";
import { addUserNotifications } from "@workspace/db/migrations/add-user-notifications";
import { addOrderItems } from "@workspace/db/migrations/add-order-items";
import { migrate as addMenuDealDiscountPercent } from "@workspace/db/migrations/add-menu-deal-discount-percent";
import { addSupportMessages } from "@workspace/db/migrations/add-support-messages";
import { addSupportTickets } from "@workspace/db/migrations/add-support-tickets";

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

const io = new SocketServer(httpServer, {
  path: "/api/socket.io",
  cors: { origin: "*" },
});
setupOrdersNamespace(io);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  startOrderExpiryJob();
  startDealExpiryJob();
  startUploadCleanupJob();
  // Generate banner template preview PNGs at startup so <img> tags work immediately
  ensurePreviewsExist().catch((e) =>
    logger.error({ err: e }, "Failed to generate banner previews"),
  );
  backfillRestaurantPhones().catch((e) =>
    logger.error({ err: e }, "Failed to backfill restaurant phones"),
  );
  addMenuItemSubcategory().catch((e) =>
    logger.error({ err: e }, "Failed to add menu item subcategory columns"),
  );
  addRestaurantPortal().catch((e) =>
    logger.error({ err: e }, "Failed to run restaurant portal migration"),
  );
  addPromoImages().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run promo images migration"),
  );
  addPromoImagesTemplate().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run promo images template migration"),
  );
  addMenuItemAvailability().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run menu item availability migration"),
  );
  addPromoRestaurant().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run promo restaurant migration"),
  );
  addMenuItemDeals().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run menu item deals migration"),
  );
  addDealExpiresAt().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run deal expires at migration"),
  );
  addAdminNotes().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run admin notes migration"),
  );
  addFlashDeals().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run flash deals migration"),
  );
  addLoyalty().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run loyalty migration"),
  );
  addUserAchievements().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run user achievements migration"),
  );
  addCustomerSubscriptions().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run customer subscriptions migration"),
  );
  addUserBlocked().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run user blocked migration"),
  );
  addUserNotifications().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run user notifications migration"),
  );
  addOrderItems().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run order items migration"),
  );
  addMenuDealDiscountPercent().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run menu deal discount percent migration"),
  );
  addSupportMessages().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run support messages migration"),
  );
  addSupportTickets().catch((e: unknown) =>
    logger.error({ err: e }, "Failed to run support tickets migration"),
  );
});
