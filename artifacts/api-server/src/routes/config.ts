import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_PHONE = process.env.ADMIN_PHONE || "+963999000111";

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

export default router;
