import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function getJwtSecret(): string | null {
  return process.env["JWT_SECRET"] ?? null;
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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  let payload: AuthPayload & { tokenType?: string };
  try {
    payload = jwt.verify(token, secret) as AuthPayload & { tokenType?: string };
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (payload.tokenType === "restaurant_portal") {
    res.status(401).json({ error: "Invalid token type" });
    return;
  }
  if (!payload.userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [dbUser] = await db
    .select({ isBlocked: usersTable.isBlocked })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (dbUser?.isBlocked) {
    res.status(403).json({ error: "Account is blocked" });
    return;
  }

  req.auth = payload;
  next();
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
