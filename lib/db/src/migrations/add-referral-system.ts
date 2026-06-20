import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addReferralSystem(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id text PRIMARY KEY,
      user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      code text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_referral_codes_code
    ON referral_codes (code)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS referrals (
      id text PRIMARY KEY,
      referrer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      order_id text REFERENCES orders(id) ON DELETE SET NULL,
      commission_amount integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id
    ON referrals (referrer_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount integer NOT NULL,
      type text NOT NULL,
      description text NOT NULL DEFAULT '',
      referral_id text REFERENCES referrals(id) ON DELETE SET NULL,
      order_id text REFERENCES orders(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_customer_wallet_txs_user_id
    ON customer_wallet_transactions (user_id)
  `);

  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS
    wallet_balance integer NOT NULL DEFAULT 0
  `);

  console.log("[migration] referral_system tables ensured.");
}
