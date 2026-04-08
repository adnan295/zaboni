import { Router, type IRouter } from "express";
import { randomInt } from "crypto";
import { db, otpCodesTable, usersTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

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

const DEV_JWT_SECRET = "marsool-dev-secret-change-in-production-please";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] !== "production") {
      console.warn("[auth] JWT_SECRET not set — using insecure dev default");
      return DEV_JWT_SECRET;
    }
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

async function sendOtpSms(phone: string, code: string): Promise<void> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const fromPhone = process.env["TWILIO_PHONE_NUMBER"];

  const twilioConfigured = accountSid && authToken && fromPhone;

  if (!twilioConfigured && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) must be configured in production",
    );
  }

  if (twilioConfigured) {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid!, authToken!);
    await client.messages.create({
      body: `رمز التحقق الخاص بك في مرسول: ${code}\nYour Marsool verification code: ${code}`,
      from: fromPhone!,
      to: phone,
    });
    console.log(`[auth] SMS sent to ${phone}`);
  } else {
    console.log(`[auth] DEV MODE — OTP for ${phone}: ${code}`);
  }
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

  try {
    await sendOtpSms(phone, code);
  } catch (err) {
    console.error("[auth] Failed to send SMS:", err);
    res.status(500).json({ error: "فشل إرسال الرسالة / Failed to send SMS" });
    return;
  }

  const isDev = !process.env["TWILIO_ACCOUNT_SID"];
  res.json({
    success: true,
    expiresInMinutes: OTP_TTL_MINUTES,
    ...(isDev ? { devCode: code } : {}),
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

  const existingUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  let userId: string;
  let userName: string;

  let userRole: "customer" | "courier" = "customer";

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    userName = name ?? existingUser[0].name;
    userRole = (existingUser[0].role as "customer" | "courier") ?? "customer";
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
    user: { id: userId, phone, name: userName, role: userRole },
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
    .select({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name, role: usersTable.role })
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
  name: z.string().min(1).max(60),
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
  if (!body.success) { res.status(400).json({ error: "Invalid name" }); return; }

  const rows = await db
    .update(usersTable)
    .set({ name: body.data.name })
    .where(eq(usersTable.id, userId))
    .returning();

  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }

  res.json(rows[0]);
});

export default router;
