import { Router, type IRouter } from "express";
import healthRouter from "./health";
import restaurantsRouter from "./restaurants";
import ordersRouter from "./orders";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import courierRouter from "./courier";
import adminRouter from "./admin";
import favoritesRouter from "./favorites";
import notificationsRouter from "./notifications";
import configRouter from "./config";
import storageRouter from "./storage";
import restaurantPortalRouter from "./restaurant-portal";
import loyaltyRouter from "./loyalty";
import achievementsRouter from "./achievements";
import subscriptionsRouter from "./subscriptions";
import supportRouter from "./support";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(configRouter);
router.use(restaurantsRouter);
router.use(adminRouter);
router.use(notificationsRouter);
router.use(storageRouter);
router.use(restaurantPortalRouter);

router.use(supportRouter);

router.use(requireAuth);
router.use(ordersRouter);
router.use(addressesRouter);
router.use(courierRouter);
router.use(favoritesRouter);
router.use(loyaltyRouter);
router.use(achievementsRouter);
router.use(subscriptionsRouter);

export default router;
