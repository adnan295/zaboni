import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_PHONE = process.env.ADMIN_PHONE || "+963999000111";

router.get("/config/expo-link", (_req, res) => {
  const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  res.json({ url: domain ? `exp://${domain}` : null });
});

router.get("/config/contact", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["contact_phone", "contact_whatsapp"]));

    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }

    const phone = map["contact_phone"] || DEFAULT_PHONE;
    const whatsapp = map["contact_whatsapp"] || phone;

    res.json({ phone, whatsapp });
  } catch {
    res.json({ phone: DEFAULT_PHONE, whatsapp: DEFAULT_PHONE });
  }
});

router.get("/config/app", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["show_all_tab"]));
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ showAllTab: (map["show_all_tab"] ?? "1") !== "0" });
  } catch {
    res.json({ showAllTab: true });
  }
});

export const DEFAULT_ERRAND_DELIVERY_FEE = 150;

// Delivery fee for an errand ("free"/external) order, controlled from the admin
// settings panel so it can be changed WITHOUT shipping a new app build. The app
// reads this at order time; the server re-reads it authoritatively when creating
// the order (see routes/orders.ts).
router.get("/config/errand-fee", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["errand_delivery_fee"]));
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    const raw = parseInt(map["errand_delivery_fee"] ?? "", 10);
    const fee = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ERRAND_DELIVERY_FEE;
    res.json({ fee });
  } catch {
    res.json({ fee: DEFAULT_ERRAND_DELIVERY_FEE });
  }
});

const DEFAULT_HOME_FILTERS = [
  { key: "rating", labelAr: "تقييم", enabled: false, order: 0 },
  { key: "time", labelAr: "وقت", enabled: false, order: 1 },
  { key: "fee", labelAr: "سعر", enabled: false, order: 2 },
  { key: "openNow", labelAr: "مفتوح الآن", enabled: false, order: 3 },
];

router.get("/config/home-filters", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["home_filters"]));
    const row = rows[0];
    if (!row) {
      res.json(DEFAULT_HOME_FILTERS);
      return;
    }
    const parsed = JSON.parse(row.value);
    res.json(Array.isArray(parsed) ? parsed : DEFAULT_HOME_FILTERS);
  } catch {
    res.json(DEFAULT_HOME_FILTERS);
  }
});

const TAB_AVAILABLE_TYPES = [
  { type: "home",      labelAr: "الرئيسية"       },
  { type: "favorites", labelAr: "المفضلة"         },
  { type: "orders",    labelAr: "طلباتي"           },
  { type: "profile",   labelAr: "حسابي"            },
  { type: "offers",    labelAr: "عروض"             },
  { type: "errand",    labelAr: "🛍 اطلب من أي مكان" },
  { type: "search",    labelAr: "بحث"      },
] as const;

const DEFAULT_TAB_BAR = [
  { type: "home",      labelAr: "الرئيسية", order: 0 },
  { type: "favorites", labelAr: "المفضلة",  order: 1 },
  { type: "orders",    labelAr: "طلباتي",   order: 2 },
  { type: "errand",    labelAr: "اطلب",     order: 3 },
  { type: "profile",   labelAr: "حسابي",    order: 4 },
];

router.get("/config/tab-bar", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["tab_bar_config"]));
    const row = rows[0];
    if (!row) { res.json(DEFAULT_TAB_BAR); return; }
    const parsed = JSON.parse(row.value);
    res.json(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TAB_BAR);
  } catch {
    res.json(DEFAULT_TAB_BAR);
  }
});

router.get("/config/tab-bar/available-types", (_req, res) => {
  res.json(TAB_AVAILABLE_TYPES);
});

export default router;
