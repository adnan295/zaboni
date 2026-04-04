import { Router, type IRouter } from "express";
import healthRouter from "./health";
import restaurantsRouter from "./restaurants";
import ordersRouter from "./orders";
import addressesRouter from "./addresses";
import authRouter from "./auth";
import chatRouter from "./chat";
import courierRouter from "./courier";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(restaurantsRouter);

router.use(requireAuth);
router.use(ordersRouter);
router.use(addressesRouter);
router.use(chatRouter);
router.use(courierRouter);

export default router;
