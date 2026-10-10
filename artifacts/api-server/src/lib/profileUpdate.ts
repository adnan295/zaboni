import { db, usersTable, otpCodesTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";

export class ProfileUpdateError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const attempts = new Map<string, { count: number; until: number }>();

/** Consume proof of ownership and change the number in the same transaction. */
export async function updateVerifiedProfile(userId: string, updates: { name?: string; phone?: string; avatarUrl?: string | null }, code?: string) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).for("update");
    if (!user) throw new ProfileUpdateError(404, "الحساب غير موجود");
    if (user.isBlocked) throw new ProfileUpdateError(403, "الحساب موقوف");
    if (updates.phone !== undefined) {
      if (!isValidPhoneNumber(updates.phone)) throw new ProfileUpdateError(400, "رقم الهاتف غير صحيح");
      updates.phone = parsePhoneNumber(updates.phone).format("E.164");
      if (updates.phone !== user.phone) {
        if (!code || !/^\d{6}$/.test(code)) throw new ProfileUpdateError(400, "يرجى إدخال رمز التحقق المرسل إلى الرقم الجديد");
        const now = Date.now();
        for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
        const entry = attempts.get(userId) ?? { count: 0, until: now + 10 * 60_000 };
        if (entry.count >= 5) throw new ProfileUpdateError(429, "محاولات كثيرة، يرجى الانتظار عشر دقائق");
        entry.count++; attempts.set(userId, entry);
        const [owner] = await tx.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, updates.phone)).limit(1);
        if (owner && owner.id !== userId) throw new ProfileUpdateError(409, "رقم الهاتف مستخدم من قِبَل حساب آخر");
        const proof = await tx.update(otpCodesTable).set({ used: true }).where(and(
          eq(otpCodesTable.phone, updates.phone), eq(otpCodesTable.code, code),
          eq(otpCodesTable.used, false), gt(otpCodesTable.expiresAt, new Date()),
        )).returning({ id: otpCodesTable.id });
        if (!proof.length) throw new ProfileUpdateError(401, "رمز التحقق غير صحيح أو منتهي الصلاحية");
      }
    }
    const [saved] = await tx.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning({
      id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatarUrl: usersTable.avatarUrl,
    });
    return saved;
  }).catch((error: unknown) => {
    if ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505")
      throw new ProfileUpdateError(409, "رقم الهاتف مستخدم من قِبَل حساب آخر");
    throw error;
  });
}
