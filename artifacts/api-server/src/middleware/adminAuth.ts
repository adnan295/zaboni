import { type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "crypto";

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({
      error: "Admin panel is not configured. Set the ADMIN_SECRET environment variable.",
    });
    return;
  }

  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let authorised = false;
  try {
    const given = Buffer.from(token);
    const expected = Buffer.from(ADMIN_SECRET);
    authorised =
      given.byteLength === expected.byteLength &&
      timingSafeEqual(given, expected);
  } catch {
    authorised = false;
  }

  if (!authorised) {
    req.log.warn({ ip: req.ip }, "Failed admin auth attempt");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
