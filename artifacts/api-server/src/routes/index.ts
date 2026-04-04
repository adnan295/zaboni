import { Router, type IRouter } from "express";
import healthRouter from "./health";
import restaurantsRouter from "./restaurants";
import ordersRouter from "./orders";
import addressesRouter from "./addresses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(restaurantsRouter);
router.use(ordersRouter);
router.use(addressesRouter);

export default router;
