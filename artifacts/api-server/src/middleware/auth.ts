import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

const DEV_JWT_SECRET = "marsool-dev-secret-change-in-production-please";

function getJwtSecret(): string | null {
  const secret = process.env["JWT_SECRET"];
  if (!secret && process.env["NODE_ENV"] !== "production") return DEV_JWT_SECRET;
  return secret ?? null;
}

export interface AuthPayload {
  userId: string;
  phone: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = getJwtSecret();

  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET not configured" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  const secret = getJwtSecret();

  if (!secret) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.auth = payload;
  } catch {
  }

  next();
}
