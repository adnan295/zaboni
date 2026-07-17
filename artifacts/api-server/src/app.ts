import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import legalRouter from "./routes/legal";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind an SSL-terminating reverse proxy (nginx/Caddy/Cloudflare). Trust it so
// `req.protocol`/`req.secure` reflect the original HTTPS request (via
// X-Forwarded-Proto) and `req.ip` is the real client. Without this, local-mode
// storage upload URLs were built as cleartext `http://…`, which Android blocks
// (and browsers block as mixed-content) → "Network request failed" on receipt
// and admin image uploads.
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skipSuccessfulRequests: true,
});

app.use("/api/admin", adminRateLimit);

app.use(legalRouter);
app.use("/api", router);

export default app;
