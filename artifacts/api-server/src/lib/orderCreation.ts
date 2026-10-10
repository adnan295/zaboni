import { createHash } from "node:crypto";
import { db, orderCreationRequestsTable as requests } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class OrderCreationError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function creationIdentity(raw: unknown, payload: unknown) {
  if (raw == null) return null; // Older clients remain compatible; updated clients always send a key.
  if (typeof raw !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(raw)) throw new OrderCreationError(400, "invalid_idempotency_key");
  return { key: raw, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}
type Identity = ReturnType<typeof creationIdentity>;
function check(row: typeof requests.$inferSelect, identity: NonNullable<Identity>) {
  if (row.fingerprint !== identity.fingerprint) throw new OrderCreationError(409, "idempotency_key_conflict");
  return row.response;
}
export async function previousOrderCreation(userId: string, identity: Identity) {
  if (!identity) return null;
  const [row] = await db.select().from(requests).where(and(eq(requests.userId, userId), eq(requests.key, identity.key)));
  return row ? check(row, identity) : null;
}
export async function createOrderOnce<T extends Record<string, unknown>>(userId: string, identity: Identity, work: (tx: Tx) => Promise<T>): Promise<{ response: T; replayed: boolean }> {
  return db.transaction(async tx => {
    if (identity) {
      // A conflicting INSERT waits for the first transaction. The reservation,
      // order, ledger and response commit together or all roll back.
      await tx.insert(requests).values({ userId, ...identity }).onConflictDoNothing();
      const [row] = await tx.select().from(requests).where(and(eq(requests.userId, userId), eq(requests.key, identity.key))).for("update");
      const response = check(row!, identity);
      if (response) return { response: response as T, replayed: true };
    }
    const response = await work(tx);
    if (identity) await tx.update(requests).set({ response }).where(and(eq(requests.userId, userId), eq(requests.key, identity.key)));
    return { response, replayed: false };
  });
}
export async function ensureOrderCreationSchema() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS order_creation_requests (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key text NOT NULL, fingerprint text NOT NULL, response jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, request_key)
  )`);
}
