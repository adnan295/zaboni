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

export default router;
