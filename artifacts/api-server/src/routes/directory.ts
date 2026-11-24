// "دليل حمص" — browse every mapped restaurant and café, read its menu, and get
// the delivery fee from that place to the customer. Ordering itself goes through
// POST /orders as a free order with `directoryPlaceId` (see routes/orders).
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  listPlaces, getPlace, listCategories, upsertPlaces, adminListPlaces, deletePlace, ensureDirectorySchema,
  type DirectoryPlace,
} from "../lib/directory";
import { haversineKm, getFeeForDistance } from "../lib/deliveryZones";
import { checkCoverage } from "../lib/coverage";
import { isUserSubscribed, getSubscriptionSettings } from "../lib/customerSubscription";
import { requireAdmin } from "../middleware/adminAuth";
import { optionalAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** What a customer sees: no phone number (the courier gets it with the order). */
const publicPlace = (p: DirectoryPlace) => ({
  id: p.id, nameAr: p.nameAr, lat: p.lat, lon: p.lon, district: p.district, category: p.category,
  menu: p.menu, menuImages: p.menuImages, logo: p.logo,
});

export interface DirectoryQuote {
  fee: number;
  km: number;
  outOfArea: boolean;
}

/** Same pricing and coverage as a restaurant order, measured from the place itself. */
export async function quoteFromPlace(place: { lat: number; lon: number }, dest: { lat: number; lon: number }, userId?: string | null): Promise<DirectoryQuote> {
  const km = haversineKm(place.lat, place.lon, dest.lat, dest.lon);
  const [coverage, zone] = await Promise.all([checkCoverage(dest.lat, dest.lon), getFeeForDistance(km)]);
  const outOfArea = coverage.hasCoverage ? !coverage.inside : zone.outOfRange;
  let fee = zone.fee;
  if (userId && (await isUserSubscribed(userId))) fee = (await getSubscriptionSettings()).subscriberDeliveryFee;
  return { fee, km: Math.round(km * 10) / 10, outOfArea };
}

router.get("/directory/places", async (req, res) => {
  try {
    const q = typeof req.query["q"] === "string" ? req.query["q"].slice(0, 60) : undefined;
    const category = typeof req.query["category"] === "string" ? req.query["category"].slice(0, 40) : undefined;
    const [places, categories] = await Promise.all([listPlaces({ q, category }), listCategories()]);
    res.json({ places, categories });
  } catch (err) {
    logger.error({ err }, "[directory] list failed");
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/directory/places/:id", async (req, res) => {
  const place = await getPlace(String(req.params["id"])).catch(() => null);
  if (!place) { res.status(404).json({ error: "not_found" }); return; }
  res.json(publicPlace(place));
});

const quoteQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

router.get("/directory/places/:id/quote", optionalAuth, async (req: Request, res) => {
  const q = quoteQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "location_required" }); return; }
  const place = await getPlace(String(req.params["id"])).catch(() => null);
  if (!place) { res.status(404).json({ error: "not_found" }); return; }
  try {
    res.json(await quoteFromPlace(place, q.data, (req as Request & { auth?: { userId?: string } }).auth?.userId ?? null));
  } catch (err) {
    logger.error({ err }, "[directory] quote failed");
    res.status(500).json({ error: "server_error" });
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

const sectionSchema = z.object({ title: z.string().max(80).default(""), items: z.array(z.string().max(120)).max(300) });
const placeSchema = z.object({
  id: z.string().max(64).optional(),
  nameAr: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  lat: z.number(),
  lon: z.number(),
  district: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  menu: z.array(sectionSchema).max(60).optional(),
  menuImages: z.array(z.string().max(500)).max(20).optional(),
  logo: z.string().max(500).nullable().optional(),
  isPublished: z.boolean().optional(),
});

router.get("/admin/directory/places", requireAdmin, async (_req, res) => {
  res.json(await adminListPlaces());
});

/** Bulk import or edit: an array of places, matched by id so a re-import updates. */
router.post("/admin/directory/places", requireAdmin, async (req, res) => {
  const body = z.array(placeSchema).max(2000).safeParse(Array.isArray(req.body) ? req.body : [req.body]);
  if (!body.success) { res.status(400).json({ error: "invalid_places", issues: body.error.issues.slice(0, 5) }); return; }
  res.json(await upsertPlaces(body.data));
});

router.delete("/admin/directory/places/:id", requireAdmin, async (req, res) => {
  res.json({ deleted: await deletePlace(String(req.params["id"])) });
});

export { ensureDirectorySchema };
export default router;
