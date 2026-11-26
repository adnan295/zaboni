// «اطلب واربح» — see lib/stamps.ts.
//   GET  /stamps/programs                public: which restaurants run it (the card badge)
//   GET  /stamps/restaurants/:id         the strip on a restaurant page (+ my card when signed in)
//   GET  /stamps/me                      «أختامي»: my cards and ready coupons
//   GET  /stamps/checkout?restaurantId   the coupon «راجع طلبك» offers
//   GET/PUT /admin/stamps…               terms per restaurant and the report
import { Router, type IRouter } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/adminAuth";
import { optionalAuth, requireAuth } from "../middleware/auth";
import {
  adminPrograms, awardStampForOrder, cardForRestaurant, couponForCheckout, listEnabledPrograms, myStamps,
  StampError, upsertProgram, type StampAward,
} from "../lib/stamps";
import { sendPushToUsers } from "../lib/push";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let programsCache: { at: number; value: Awaited<ReturnType<typeof listEnabledPrograms>> } | null = null;

router.get("/stamps/programs", async (_req, res) => {
  if (!programsCache || Date.now() - programsCache.at > 60_000) {
    programsCache = { at: Date.now(), value: await listEnabledPrograms() };
  }
  res.json({ programs: programsCache.value });
});

router.get("/stamps/restaurants/:id", optionalAuth, async (req, res) => {
  const card = await cardForRestaurant(req.auth?.userId ?? null, String(req.params.id));
  res.json({ card });
});

router.get("/stamps/me", requireAuth, async (req, res) => {
  res.json(await myStamps(req.auth!.userId));
});

router.get("/stamps/checkout", requireAuth, async (req, res) => {
  const restaurantId = typeof req.query.restaurantId === "string" ? req.query.restaurantId : "";
  res.json({ coupon: restaurantId ? await couponForCheckout(req.auth!.userId, restaurantId) : null });
});

// ── Admin ────────────────────────────────────────────────────────────────────

router.get("/admin/stamps", requireAdmin, async (_req, res) => {
  res.json({ restaurants: await adminPrograms() });
});

router.get("/admin/stamps/:restaurantId/menu", requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name_ar, price FROM menu_items WHERE restaurant_id = $1 ORDER BY category_ar, name_ar`,
    [String(req.params.restaurantId)],
  );
  res.json({ items: rows.map((r: Record<string, unknown>) => ({ id: r.id, nameAr: r.name_ar, price: Number(r.price) })) });
});

const programSchema = z.object({
  enabled: z.boolean(),
  goal: z.number().int(),
  minOrder: z.number().min(0),
  rewardType: z.enum(["amount", "item"]),
  rewardAmount: z.number().min(0).default(0),
  rewardItemId: z.string().nullable().optional(),
  couponDays: z.number().int().min(1).max(365),
  monthlyCap: z.number().int().min(0).nullable().optional(),
});

router.put("/admin/stamps/:restaurantId", requireAdmin, async (req, res) => {
  const parsed = programSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات ناقصة" });
    return;
  }
  try {
    const program = await upsertProgram({
      restaurantId: String(req.params.restaurantId),
      ...parsed.data,
      rewardItemId: parsed.data.rewardItemId ?? null,
      rewardItemName: null,
      monthlyCap: parsed.data.monthlyCap ?? null,
    });
    programsCache = null;
    res.json({ program });
  } catch (e) {
    if (e instanceof StampError) {
      res.status(e.status).json({ error: e.message, code: e.code });
      return;
    }
    throw e;
  }
});

/**
 * After an order is delivered (the status change has committed): stamp it and
 * tell the customer where their card stands. Never throws.
 */
export function stampDeliveredOrder(orderId: string): void {
  void awardStampForOrder(orderId)
    .then((award) => (award ? notifyStamp(award) : undefined))
    .catch((err) => logger.warn({ err, orderId }, "stamp award failed"));
}

async function notifyStamp(a: StampAward): Promise<void> {
  const place = a.restaurantName || "المطعم";
  const [title, body] = a.coupon
    ? [`ربحت ${a.reward}`, `كمّلت أختامك عند ${place}. الكوبون بـ«أختامي» وبيطلع لحاله لما تطلب منهم.`]
    : [`ختم جديد عند ${place}`, `معك ${a.stamps} من ${a.goal}. باقيلك ${a.goal - a.stamps} وبتاخد ${a.reward}.`];
  await sendPushToUsers([a.userId], title, body, { type: "stamps", restaurantId: a.restaurantId }).catch(() => {});
}

export default router;
