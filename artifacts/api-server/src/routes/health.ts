import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Mobile app crash reporter — the error boundary POSTs here so client-side
// render crashes (invisible in a production build) show up in the server log.
router.post("/client-error", (req, res) => {
  const body = (req.body ?? {}) as {
    message?: unknown;
    stack?: unknown;
    componentStack?: unknown;
    context?: unknown;
  };
  logger.error(
    {
      clientError: {
        message: typeof body.message === "string" ? body.message.slice(0, 2000) : null,
        stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : null,
        componentStack:
          typeof body.componentStack === "string" ? body.componentStack.slice(0, 4000) : null,
        context: typeof body.context === "string" ? body.context.slice(0, 200) : null,
      },
    },
    "[client-crash] mobile app error boundary",
  );
  res.json({ ok: true });
});

export default router;
