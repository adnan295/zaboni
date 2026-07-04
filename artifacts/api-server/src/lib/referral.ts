import {
  db,
  usersTable,
  referralCodesTable,
  referralsTable,
  customerWalletTransactionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export const REFERRAL_COMMISSION_RATE = 0.05;

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await db
    .select({ code: referralCodesTable.code })
    .from(referralCodesTable)
    .where(eq(referralCodesTable.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0]!.code;

  let code: string;
  let attempts = 0;
  while (true) {
    attempts++;
    code = generateReferralCode();
    try {
      await db.insert(referralCodesTable).values({
        id: `rc_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        userId,
        code,
      });
      return code;
    } catch {
      if (attempts >= 10) throw new Error("Failed to generate unique referral code");
    }
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function awardReferralCommissionInTx(
  tx: Tx,
  referralId: string,
  referrerId: string,
  orderId: string,
  itemsTotal: number
): Promise<number> {
  const commission = Math.floor(itemsTotal * REFERRAL_COMMISSION_RATE);
  if (commission <= 0) return 0;

  await tx
    .update(referralsTable)
    .set({ status: "paid", orderId, commissionAmount: commission })
    .where(eq(referralsTable.id, referralId));

  await tx
    .update(usersTable)
    .set({ walletBalance: sql`${usersTable.walletBalance} + ${commission}` })
    .where(eq(usersTable.id, referrerId));

  const txId = `cwt_ref_${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  await tx.insert(customerWalletTransactionsTable).values({
    id: txId,
    userId: referrerId,
    amount: commission,
    type: "referral_commission",
    description: `عمولة إحالة من طلب #${orderId.slice(-6)}`,
    referralId,
    orderId,
  });

  return commission;
}
