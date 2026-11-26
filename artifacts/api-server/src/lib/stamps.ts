// «اطلب واربح» — a stamp card per partner restaurant.
//
// The admin agrees terms with a restaurant and sets them here: how many stamps,
// the minimum order that earns one, and the reward (an amount off, or one dish
// free). Each delivered order at that restaurant above the minimum earns one
// stamp (one a day). A full card turns into a coupon that is only good at that
// restaurant, for a set number of days. The restaurant funds the reward: it
// comes off the food, never off the delivery fee, which is the courier's.

import { pool } from "@workspace/db";
import { randomBytes } from "node:crypto";

export type RewardType = "amount" | "item";

export interface StampProgram {
  restaurantId: string;
  enabled: boolean;
  goal: number;
  minOrder: number;
  rewardType: RewardType;
  rewardAmount: number;
  rewardItemId: string | null;
  rewardItemName: string | null;
  couponDays: number;
  monthlyCap: number | null;
}

export interface StampCoupon {
  id: string;
  restaurantId: string;
  restaurantName: string;
  label: string;
  rewardType: RewardType;
  rewardAmount: number;
  rewardItemId: string | null;
  expiresAt: string;
}

/** Stamps not added to for this long are wiped, so no restaurant carries an open debt forever. */
export const STAMP_EXPIRY_DAYS = 90;
/** A coupon claimed by an order that never got created is released after this long. */
const STALE_CLAIM_MINUTES = 10;

let schemaReady: Promise<void> | null = null;
export function ensureStampsSchema(): Promise<void> {
  schemaReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS stamp_programs (
      restaurant_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      goal INTEGER NOT NULL DEFAULT 5,
      min_order INTEGER NOT NULL DEFAULT 0,
      reward_type TEXT NOT NULL DEFAULT 'amount',
      reward_amount INTEGER NOT NULL DEFAULT 0,
      reward_item_id TEXT,
      reward_item_name TEXT,
      coupon_days INTEGER NOT NULL DEFAULT 30,
      monthly_cap INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stamp_cards (
      user_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      stamps INTEGER NOT NULL DEFAULT 0,
      last_stamp_day TEXT,
      last_stamp_at TIMESTAMPTZ,
      PRIMARY KEY (user_id, restaurant_id)
    );
    CREATE TABLE IF NOT EXISTS stamp_events (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stamp_coupons (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount INTEGER NOT NULL DEFAULT 0,
      reward_item_id TEXT,
      reward_item_name TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_order_id TEXT,
      used_at TIMESTAMPTZ,
      discount INTEGER
    );
    CREATE INDEX IF NOT EXISTS stamp_coupons_user_idx ON stamp_coupons (user_id, status);
    CREATE INDEX IF NOT EXISTS stamp_coupons_restaurant_idx ON stamp_coupons (restaurant_id, created_at);
  `).then(() => undefined);
  schemaReady.catch(() => { schemaReady = null; });
  return schemaReady;
}

/** Homs is UTC+3 all year; the "one stamp a day" day follows the local date. */
export function homsDay(at = new Date()): string {
  return new Date(at.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function rewardLabel(p: Pick<StampProgram, "rewardType" | "rewardAmount" | "rewardItemName">): string {
  return p.rewardType === "item" && p.rewardItemName
    ? `${p.rewardItemName} ببلاش`
    : `خصم ${Number(p.rewardAmount).toLocaleString("en-US")} ل.س`;
}

const toProgram = (r: Record<string, any>): StampProgram => ({
  restaurantId: String(r.restaurant_id),
  enabled: Boolean(r.enabled),
  goal: Number(r.goal),
  minOrder: Number(r.min_order),
  rewardType: r.reward_type === "item" ? "item" : "amount",
  rewardAmount: Number(r.reward_amount ?? 0),
  rewardItemId: r.reward_item_id ?? null,
  rewardItemName: r.reward_item_name ?? null,
  couponDays: Number(r.coupon_days),
  monthlyCap: r.monthly_cap == null ? null : Number(r.monthly_cap),
});

export async function getProgram(restaurantId: string): Promise<StampProgram | null> {
  await ensureStampsSchema();
  const { rows } = await pool.query(`SELECT * FROM stamp_programs WHERE restaurant_id = $1`, [restaurantId]);
  return rows[0] ? toProgram(rows[0]) : null;
}

/** Restaurants currently running «اطلب واربح», for the badge on their cards. */
export async function listEnabledPrograms(): Promise<{ restaurantId: string; goal: number; reward: string }[]> {
  await ensureStampsSchema();
  const { rows } = await pool.query(`SELECT * FROM stamp_programs WHERE enabled ORDER BY restaurant_id`);
  return rows.map((r: Record<string, any>) => {
    const p = toProgram(r);
    return { restaurantId: p.restaurantId, goal: p.goal, reward: rewardLabel(p) };
  });
}

export class StampError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function upsertProgram(input: StampProgram): Promise<StampProgram> {
  await ensureStampsSchema();
  const goal = Math.round(input.goal);
  if (!(goal >= 2 && goal <= 20)) throw new StampError("bad_goal", "عدد الأختام لازم يكون بين 2 و 20");
  if (input.rewardType === "amount" && !(input.rewardAmount > 0)) throw new StampError("bad_reward", "حدد مبلغ الجايزة");
  if (input.rewardType === "item" && !input.rewardItemId) throw new StampError("bad_reward", "اختار الصنف المجاني");
  let itemName: string | null = null;
  if (input.rewardType === "item") {
    const { rows } = await pool.query(
      `SELECT name_ar FROM menu_items WHERE id = $1 AND restaurant_id = $2`,
      [input.rewardItemId, input.restaurantId],
    );
    if (!rows[0]) throw new StampError("bad_reward", "الصنف مو من منيو هالمطعم");
    itemName = String(rows[0].name_ar);
  }
  const days = Math.min(365, Math.max(1, Math.round(input.couponDays || 30)));
  const cap = input.monthlyCap != null && input.monthlyCap > 0 ? Math.round(input.monthlyCap) : null;
  await pool.query(
    `INSERT INTO stamp_programs (restaurant_id, enabled, goal, min_order, reward_type, reward_amount, reward_item_id, reward_item_name, coupon_days, monthly_cap, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (restaurant_id) DO UPDATE SET enabled = EXCLUDED.enabled, goal = EXCLUDED.goal, min_order = EXCLUDED.min_order,
       reward_type = EXCLUDED.reward_type, reward_amount = EXCLUDED.reward_amount, reward_item_id = EXCLUDED.reward_item_id,
       reward_item_name = EXCLUDED.reward_item_name, coupon_days = EXCLUDED.coupon_days, monthly_cap = EXCLUDED.monthly_cap, updated_at = NOW()`,
    [input.restaurantId, input.enabled, goal, Math.max(0, Math.round(input.minOrder || 0)), input.rewardType,
      input.rewardType === "amount" ? Math.round(input.rewardAmount) : 0,
      input.rewardType === "item" ? input.rewardItemId : null, itemName, days, cap],
  );
  return (await getProgram(input.restaurantId))!;
}

export interface StampAward {
  userId: string;
  restaurantId: string;
  restaurantName: string;
  stamps: number;
  goal: number;
  reward: string;
  coupon: { id: string; expiresAt: string } | null;
}

/**
 * Called once an order is delivered. Adds a stamp when the order qualifies and
 * turns a full card into a coupon. Safe to call twice for the same order.
 */
export async function awardStampForOrder(orderId: string, now = new Date()): Promise<StampAward | null> {
  await ensureStampsSchema();
  const { rows: orders } = await pool.query(
    `SELECT o.id, o.user_id, o.restaurant_id, o.restaurant_name, o.status, o.order_type, o.total_price, u.role
       FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [orderId],
  );
  const o = orders[0];
  if (!o || o.status !== "delivered" || !o.restaurant_id || o.order_type === "errand") return null;
  if (o.role === "courier") return null; // couriers ordering for themselves do not collect stamps
  const program = await getProgram(String(o.restaurant_id));
  if (!program || !program.enabled) return null;
  if (Number(o.total_price ?? 0) < program.minOrder) return null;

  const day = homsDay(now);
  const { rows: card0 } = await pool.query(
    `SELECT stamps, last_stamp_day, last_stamp_at FROM stamp_cards WHERE user_id = $1 AND restaurant_id = $2`,
    [o.user_id, o.restaurant_id],
  );
  if (card0[0]?.last_stamp_day === day) return null; // one stamp a day per restaurant

  const event = await pool.query(
    `INSERT INTO stamp_events (order_id, user_id, restaurant_id) VALUES ($1, $2, $3) ON CONFLICT (order_id) DO NOTHING RETURNING order_id`,
    [orderId, o.user_id, o.restaurant_id],
  );
  if (!event.rows[0]) return null; // this order already stamped

  const expired = card0[0]?.last_stamp_at
    && now.getTime() - new Date(card0[0].last_stamp_at).getTime() > STAMP_EXPIRY_DAYS * 86_400_000;
  let stamps = (expired ? 0 : Number(card0[0]?.stamps ?? 0)) + 1;

  let coupon: StampAward["coupon"] = null;
  if (stamps >= program.goal) {
    const canIssue = await underMonthlyCap(program, now);
    if (canIssue) {
      const id = "cpn_" + randomBytes(6).toString("hex");
      const expiresAt = new Date(now.getTime() + program.couponDays * 86_400_000);
      await pool.query(
        `INSERT INTO stamp_coupons (id, user_id, restaurant_id, reward_type, reward_amount, reward_item_id, reward_item_name, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, o.user_id, o.restaurant_id, program.rewardType, program.rewardAmount, program.rewardItemId, program.rewardItemName, now, expiresAt],
      );
      coupon = { id, expiresAt: expiresAt.toISOString() };
      stamps -= program.goal;
    } else {
      // The restaurant's monthly budget is spent: the card stays full and pays
      // out on the next qualifying order once the month turns.
      stamps = program.goal;
    }
  }
  await pool.query(
    `INSERT INTO stamp_cards (user_id, restaurant_id, stamps, last_stamp_day, last_stamp_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, restaurant_id) DO UPDATE SET stamps = EXCLUDED.stamps, last_stamp_day = EXCLUDED.last_stamp_day, last_stamp_at = EXCLUDED.last_stamp_at`,
    [o.user_id, o.restaurant_id, stamps, day, now],
  );
  return {
    userId: String(o.user_id), restaurantId: String(o.restaurant_id), restaurantName: String(o.restaurant_name ?? ""),
    stamps: coupon ? program.goal : stamps, goal: program.goal, reward: rewardLabel(program), coupon,
  };
}

async function underMonthlyCap(p: StampProgram, now: Date): Promise<boolean> {
  if (p.monthlyCap == null) return true;
  const month = homsDay(now).slice(0, 7);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM stamp_coupons WHERE restaurant_id = $1 AND to_char(created_at + INTERVAL '3 hours', 'YYYY-MM') = $2`,
    [p.restaurantId, month],
  );
  return Number(rows[0]?.n ?? 0) < p.monthlyCap;
}

/** Coupons held by orders that were cancelled (or never created) go back to the customer. */
export async function releaseStaleCoupons(now = new Date()): Promise<void> {
  await ensureStampsSchema();
  await pool.query(
    `UPDATE stamp_coupons c SET status = 'ready', used_order_id = NULL, used_at = NULL, discount = NULL
      WHERE c.status = 'used' AND (
        EXISTS (SELECT 1 FROM orders o WHERE o.id = c.used_order_id AND o.status = 'cancelled')
        OR (NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = c.used_order_id)
            AND c.used_at < $1::timestamptz - ($2 || ' minutes')::interval))`,
    [now, String(STALE_CLAIM_MINUTES)],
  );
}

async function readyCoupons(userId: string, restaurantId?: string, now = new Date()): Promise<StampCoupon[]> {
  await releaseStaleCoupons(now);
  const { rows } = await pool.query(
    `SELECT c.*, COALESCE(r.name_ar, '') AS restaurant_name FROM stamp_coupons c
       LEFT JOIN restaurants r ON r.id = c.restaurant_id
      WHERE c.user_id = $1 AND c.status = 'ready' AND c.expires_at > $2 ${restaurantId ? "AND c.restaurant_id = $3" : ""}
      ORDER BY c.expires_at`,
    restaurantId ? [userId, now, restaurantId] : [userId, now],
  );
  return rows.map((c: Record<string, any>) => ({
    id: String(c.id),
    restaurantId: String(c.restaurant_id),
    restaurantName: String(c.restaurant_name ?? ""),
    label: rewardLabel({ rewardType: c.reward_type, rewardAmount: Number(c.reward_amount), rewardItemName: c.reward_item_name }),
    rewardType: c.reward_type === "item" ? "item" : "amount",
    rewardAmount: Number(c.reward_amount),
    rewardItemId: c.reward_item_id ?? null,
    expiresAt: new Date(c.expires_at).toISOString(),
  }));
}

export interface StampCardView {
  restaurantId: string;
  restaurantName: string;
  stamps: number;
  goal: number;
  minOrder: number;
  reward: string;
  lastStampAt: string | null;
}

const liveStamps = (stamps: number, lastStampAt: unknown, now: Date) =>
  lastStampAt && now.getTime() - new Date(lastStampAt as string).getTime() > STAMP_EXPIRY_DAYS * 86_400_000 ? 0 : stamps;

/** The strip on a restaurant page: its terms and, when signed in, this customer's card. */
export async function cardForRestaurant(userId: string | null, restaurantId: string, now = new Date()) {
  const program = await getProgram(restaurantId);
  if (!program || !program.enabled) return null;
  let stamps = 0;
  let coupon: StampCoupon | null = null;
  if (userId) {
    const { rows } = await pool.query(
      `SELECT stamps, last_stamp_at FROM stamp_cards WHERE user_id = $1 AND restaurant_id = $2`, [userId, restaurantId],
    );
    stamps = rows[0] ? liveStamps(Number(rows[0].stamps), rows[0].last_stamp_at, now) : 0;
    coupon = (await readyCoupons(userId, restaurantId, now))[0] ?? null;
  }
  return { goal: program.goal, minOrder: program.minOrder, reward: rewardLabel(program), stamps, coupon };
}

/** «أختامي»: every card this customer has started, and every coupon ready to use. */
export async function myStamps(userId: string, now = new Date()): Promise<{ cards: StampCardView[]; coupons: StampCoupon[] }> {
  await ensureStampsSchema();
  const { rows } = await pool.query(
    `SELECT c.restaurant_id, c.stamps, c.last_stamp_at, p.goal, p.min_order, p.reward_type, p.reward_amount, p.reward_item_name,
            COALESCE(r.name_ar, '') AS restaurant_name
       FROM stamp_cards c
       JOIN stamp_programs p ON p.restaurant_id = c.restaurant_id AND p.enabled
       LEFT JOIN restaurants r ON r.id = c.restaurant_id
      WHERE c.user_id = $1`,
    [userId],
  );
  const cards = rows
    .map((r: Record<string, any>) => ({
      restaurantId: String(r.restaurant_id),
      restaurantName: String(r.restaurant_name ?? ""),
      stamps: liveStamps(Number(r.stamps), r.last_stamp_at, now),
      goal: Number(r.goal),
      minOrder: Number(r.min_order),
      reward: rewardLabel({ rewardType: r.reward_type, rewardAmount: Number(r.reward_amount), rewardItemName: r.reward_item_name }),
      lastStampAt: r.last_stamp_at ? new Date(r.last_stamp_at).toISOString() : null,
    }))
    .filter((c: StampCardView) => c.stamps > 0)
    // Closest to the reward first.
    .sort((a: StampCardView, b: StampCardView) => (b.stamps / b.goal) - (a.stamps / a.goal));
  return { cards, coupons: await readyCoupons(userId, undefined, now) };
}

/** The coupon «راجع طلبك» offers for this restaurant, if the customer has one. */
export async function couponForCheckout(userId: string, restaurantId: string, now = new Date()): Promise<StampCoupon | null> {
  return (await readyCoupons(userId, restaurantId, now))[0] ?? null;
}

/**
 * Reserve a coupon for an order being created and work out what it takes off
 * the food. An "item" coupon pays for one of that dish, so the dish must be in
 * the cart. The coupon is held by the order id; if the order is cancelled (or
 * never saved) it goes back to the customer.
 */
export async function claimCoupon(args: {
  userId: string;
  couponId: string;
  restaurantId: string | null;
  orderId: string;
  items: { menuItemId: string | null; unitPrice: number }[];
  itemsTotal: number;
  now?: Date;
}): Promise<{ discount: number; note: string }> {
  const now = args.now ?? new Date();
  await releaseStaleCoupons(now);
  const { rows } = await pool.query(
    `SELECT * FROM stamp_coupons WHERE id = $1 AND user_id = $2`, [args.couponId, args.userId],
  );
  const c = rows[0];
  if (!c || c.status !== "ready" || new Date(c.expires_at) <= now) {
    throw new StampError("coupon_unavailable", "هالكوبون مو متاح هلق", 409);
  }
  if (!args.restaurantId || c.restaurant_id !== args.restaurantId) {
    throw new StampError("coupon_wrong_restaurant", "هالكوبون بينصرف بس عند المطعم يلي ربحته منه", 409);
  }
  let discount: number;
  if (c.reward_type === "item") {
    const line = args.items.find((i) => i.menuItemId === c.reward_item_id);
    if (!line) throw new StampError("coupon_item_missing", `زيد «${c.reward_item_name}» للسلة لتاخده ببلاش`, 409);
    discount = Math.round(line.unitPrice);
  } else {
    discount = Math.round(Number(c.reward_amount));
  }
  discount = Math.max(0, Math.min(discount, Math.round(args.itemsTotal)));
  const claimed = await pool.query(
    `UPDATE stamp_coupons SET status = 'used', used_order_id = $2, used_at = $3, discount = $4
      WHERE id = $1 AND status = 'ready' RETURNING id`,
    [args.couponId, args.orderId, now, discount],
  );
  if (!claimed.rows[0]) throw new StampError("coupon_unavailable", "هالكوبون مو متاح هلق", 409);
  const label = rewardLabel({ rewardType: c.reward_type, rewardAmount: Number(c.reward_amount), rewardItemName: c.reward_item_name });
  return {
    discount,
    note: `كوبون «اطلب واربح»: ${label} — مخصوم ${discount.toLocaleString("en-US")} ل.س من الفاتورة`,
  };
}

/** Give a claimed coupon back (the order could not be created). */
export async function releaseCoupon(couponId: string, orderId: string): Promise<void> {
  await pool.query(
    `UPDATE stamp_coupons SET status = 'ready', used_order_id = NULL, used_at = NULL, discount = NULL
      WHERE id = $1 AND used_order_id = $2 AND status = 'used'`,
    [couponId, orderId],
  );
}

/** Admin: every restaurant's terms with how the programme is doing. */
export async function adminPrograms(now = new Date()) {
  await ensureStampsSchema();
  await releaseStaleCoupons(now);
  const month = homsDay(now).slice(0, 7);
  const { rows } = await pool.query(
    `SELECT p.*, r.id AS rid, r.name_ar,
            (SELECT COUNT(*)::int FROM stamp_cards c WHERE c.restaurant_id = r.id AND c.stamps > 0) AS collecting,
            (SELECT COUNT(*)::int FROM stamp_coupons k WHERE k.restaurant_id = r.id) AS coupons_issued,
            (SELECT COUNT(*)::int FROM stamp_coupons k WHERE k.restaurant_id = r.id AND k.status = 'used') AS coupons_used,
            (SELECT COALESCE(SUM(k.discount), 0)::int FROM stamp_coupons k WHERE k.restaurant_id = r.id AND k.status = 'used') AS discount_given,
            (SELECT COUNT(*)::int FROM stamp_coupons k WHERE k.restaurant_id = r.id AND to_char(k.created_at + INTERVAL '3 hours', 'YYYY-MM') = $1) AS coupons_this_month,
            (SELECT COUNT(*)::int FROM stamp_events e WHERE e.restaurant_id = r.id) AS stamped_orders
       FROM restaurants r
       LEFT JOIN stamp_programs p ON p.restaurant_id = r.id
      ORDER BY (p.enabled IS TRUE) DESC, r.name_ar`,
    [month],
  );
  return rows.map((r: Record<string, any>) => ({
    restaurantId: String(r.rid),
    restaurantName: String(r.name_ar ?? ""),
    program: r.goal != null ? toProgram({ ...r, restaurant_id: r.rid }) : null,
    stats: {
      collecting: Number(r.collecting ?? 0),
      couponsIssued: Number(r.coupons_issued ?? 0),
      couponsUsed: Number(r.coupons_used ?? 0),
      discountGiven: Number(r.discount_given ?? 0),
      couponsThisMonth: Number(r.coupons_this_month ?? 0),
      stampedOrders: Number(r.stamped_orders ?? 0),
    },
  }));
}
