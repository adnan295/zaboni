import { Router, type IRouter } from "express";
import { randomInt } from "crypto";
import { db, otpCodesTable, usersTable, ordersTable } from "@workspace/db";
import { and, eq, gt, count, sum } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { sendSmsViaGateway } from "../lib/sms";
import { whatsappManager } from "../lib/whatsapp";

const router: IRouter = Router();

const OTP_TTL_MINUTES = 10;
const OTP_LENGTH = 6;

const SEND_OTP_LIMIT = 3;
const SEND_OTP_WINDOW_MS = 5 * 60 * 1000;
const VERIFY_OTP_LIMIT = 5;
const VERIFY_OTP_WINDOW_MS = 10 * 60 * 1000;

const sendOtpBucket = new Map<string, { count: number; resetAt: number }>();
const verifyOtpBucket = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
}

function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

async function sendOtpSms(phone: string, code: string): Promise<void> {
  const message = `رمز التحقق الخاص بك في زبوني: ${code}`;
  await sendSmsViaGateway(phone, message);
}

const e164Phone = z
  .string()
  .min(7)
  .max(20)
  .refine(
    (phone) => {
      try {
        return isValidPhoneNumber(phone);
      } catch {
        return false;
      }
    },
    { message: "رقم الهاتف غير صحيح — يجب أن يكون بصيغة E.164 مثل +963912345678" },
  )
  .transform((phone) => {
    const parsed = parsePhoneNumber(phone);
    return parsed.format("E.164");
  });

const sendOtpSchema = z.object({
  phone: e164Phone,
});

const verifyOtpSchema = z.object({
  phone: e164Phone,
  code: z.string().length(OTP_LENGTH),
  name: z.string().optional(),
});

router.post("/auth/send-otp", async (req, res) => {
  const body = sendOtpSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "رقم الهاتف غير صحيح / Invalid phone number" });
    return;
  }

  const { phone } = body.data;

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  const phoneKey = `phone:${phone}`;
  const ipKey = `ip:${ip}`;
  if (!checkRateLimit(sendOtpBucket, phoneKey, SEND_OTP_LIMIT, SEND_OTP_WINDOW_MS) ||
      !checkRateLimit(sendOtpBucket, ipKey, SEND_OTP_LIMIT * 3, SEND_OTP_WINDOW_MS)) {
    res.status(429).json({ error: "طلبات كثيرة جداً — حاول لاحقاً / Too many requests, try later" });
    return;
  }

  const code = generateOtp();
  const id = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db
    .update(otpCodesTable)
    .set({ used: true })
    .where(and(eq(otpCodesTable.phone, phone), eq(otpCodesTable.used, false)));

  await db.insert(otpCodesTable).values({ id, phone, code, expiresAt });

  const message = `رمز التحقق الخاص بك في مرسول: ${code}`;

  let channel: "whatsapp" | "sms" = "sms";

  const waSent = await whatsappManager.sendMessage(phone, message);
  if (waSent) {
    channel = "whatsapp";
    console.log(`[auth] OTP sent via WhatsApp to ${phone}`);
  } else {
    try {
      await sendOtpSms(phone, code);
      console.log(`[auth] OTP sent via SMS to ${phone}`);
    } catch (err) {
      console.warn("[auth] SMS skipped (no gateway configured):", (err as Error).message);
    }
  }

  res.json({
    success: true,
    channel,
    expiresInMinutes: OTP_TTL_MINUTES,
  });
});

router.post("/auth/verify-otp", async (req, res) => {
  const body = verifyOtpSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "بيانات غير صحيحة / Invalid data" });
    return;
  }

  const { phone, code, name } = body.data;

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  if (!checkRateLimit(verifyOtpBucket, `phone:${phone}`, VERIFY_OTP_LIMIT, VERIFY_OTP_WINDOW_MS) ||
      !checkRateLimit(verifyOtpBucket, `ip:${ip}`, VERIFY_OTP_LIMIT * 3, VERIFY_OTP_WINDOW_MS)) {
    res.status(429).json({ error: "محاولات كثيرة — حاول لاحقاً / Too many attempts, try later" });
    return;
  }

  const TEST_OTP = "999999";
  const isTestOtp =
    process.env["NODE_ENV"] !== "production" && code === TEST_OTP;

  if (isTestOtp) {
    console.log(`[auth] Test OTP used for phone ${phone} — skipping real verification`);
  }

  if (!isTestOtp) {
    const rows = await db
      .select()
      .from(otpCodesTable)
      .where(
        and(
          eq(otpCodesTable.phone, phone),
          eq(otpCodesTable.code, code),
          eq(otpCodesTable.used, false),
          gt(otpCodesTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      res.status(401).json({ error: "الرمز غير صحيح أو منتهي الصلاحية / Invalid or expired code" });
      return;
    }

    await db
      .update(otpCodesTable)
      .set({ used: true })
      .where(eq(otpCodesTable.id, rows[0].id));
  }

  const existingUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  let userId: string;
  let userName: string;

  let userRole: "customer" | "courier" = "customer";
  let userAvatarUrl: string | null = null;

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    userName = name ?? existingUser[0].name;
    userRole = (existingUser[0].role as "customer" | "courier") ?? "customer";
    userAvatarUrl = existingUser[0].avatarUrl ?? null;
    if (name && name !== existingUser[0].name) {
      await db.update(usersTable).set({ name }).where(eq(usersTable.id, userId));
    }
  } else {
    userId = `u_${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    userName = name ?? "";
    await db.insert(usersTable).values({ id: userId, phone, name: userName });
  }

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    res.status(500).json({ error: "JWT_SECRET not configured" });
    return;
  }

  const token = jwt.sign(
    { userId, phone, name: userName },
    secret,
    { expiresIn: "30d" },
  );

  const isNewUser = existingUser.length === 0;

  res.json({
    token,
    user: { id: userId, phone, name: userName, role: userRole, avatarUrl: userAvatarUrl },
    isNewUser,
  });
});

router.get("/auth/me", async (req, res) => {
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

  let userId: string;
  try {
    const payload = jwt.verify(token, secret) as { userId: string };
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const users = await db
    .select({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (users.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(users[0]);
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  phone: e164Phone.optional(),
  avatarUrl: z.string().max(1024).nullable().optional(),
});

router.patch("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = getJwtSecret();

  let userId: string;
  try {
    const payload = jwt.verify(token, secret) as { userId: string };
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const body = updateProfileSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid profile data", details: body.error.issues }); return; }

  const updates: Partial<{ name: string; phone: string; avatarUrl: string | null }> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.phone !== undefined) {
    const existingWithPhone = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, body.data.phone))
      .limit(1);
    if (existingWithPhone.length > 0 && existingWithPhone[0].id !== userId) {
      res.status(409).json({ error: "رقم الهاتف مستخدم من قِبَل حساب آخر" });
      return;
    }
    updates.phone = body.data.phone;
  }
  if (body.data.avatarUrl !== undefined) updates.avatarUrl = body.data.avatarUrl;

  if (Object.keys(updates).length === 0) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (existing.length === 0) { res.status(404).json({ error: "User not found" }); return; }
    res.json(existing[0]);
    return;
  }

  const rows = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();

  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }

  res.json(rows[0]);
});

router.get("/me/stats", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = getJwtSecret();

  let userId: string;
  try {
    const payload = jwt.verify(token, secret) as { userId: string };
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [userRow, totalRow, completedRow, deliveryFeeRow] = await Promise.all([
    db.select({ createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.userId, userId)),
    db.select({ count: count() }).from(ordersTable).where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered"))),
    db.select({ total: sum(ordersTable.deliveryFee) }).from(ordersTable).where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered"))),
  ]);

  res.json({
    totalOrders: totalRow[0]?.count ?? 0,
    completedOrders: completedRow[0]?.count ?? 0,
    totalDeliveryFees: Number(deliveryFeeRow[0]?.total ?? 0),
    memberSince: userRow[0]?.createdAt ?? null,
  });
});

export default router;
