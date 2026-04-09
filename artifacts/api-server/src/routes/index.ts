import { Router, type IRouter } from "express";
import healthRouter from "./health";
import restaurantsRouter from "./restaurants";
import ordersRouter from "./orders";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import chatRouter from "./chat";
import courierRouter from "./courier";
import adminRouter from "./admin";
import favoritesRouter from "./favorites";
import notificationsRouter from "./notifications";
import configRouter from "./config";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(configRouter);
router.use(restaurantsRouter);
router.use(adminRouter);
router.use(notificationsRouter);

router.use(requireAuth);
router.use(ordersRouter);
router.use(addressesRouter);
router.use(chatRouter);
router.use(courierRouter);
router.use(favoritesRouter);

export default router;
