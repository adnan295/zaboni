import { Router } from "express";
import { db, coverageAreasTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middleware/adminAuth";

const router = Router();

router.use("/admin/coverage-areas", requireAdmin);

// A polygon must be a ring of at least 3 [lat, lon] points.
const pointSchema = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const areaSchema = z.object({
  name: z.string().max(120).optional(),
  points: z.array(pointSchema).min(3).max(500),
  isActive: z.boolean().optional(),
});

// Public: the active coverage polygons, used by the customer app to draw the
// area on the map and to check the picked location before ordering.
router.get("/coverage-areas", async (_req, res) => {
  const rows = await db
    .select({ id: coverageAreasTable.id, name: coverageAreasTable.name, points: coverageAreasTable.points })
    .from(coverageAreasTable)
    .where(eq(coverageAreasTable.isActive, true));
  res.json(rows);
});

// Admin: list every area (including inactive).
router.get("/admin/coverage-areas", async (_req, res) => {
  const rows = await db
    .select()
    .from(coverageAreasTable)
    .orderBy(desc(coverageAreasTable.createdAt));
  res.json(rows);
});

router.post("/admin/coverage-areas", async (req, res) => {
  const parsed = areaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_area", message: "الرجاء رسم منطقة صحيحة (3 نقاط على الأقل)." });
    return;
  }
  const id = `cov_${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(coverageAreasTable)
    .values({
      id,
      name: parsed.data.name?.trim() ?? "",
      points: parsed.data.points,
      isActive: parsed.data.isActive ?? true,
    })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/coverage-areas/:id", async (req, res) => {
  const id = String(req.params["id"]);
  const parsed = areaSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_area" });
    return;
  }
  const updates: Partial<typeof coverageAreasTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.points !== undefined) updates.points = parsed.data.points;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  const [row] = await db
    .update(coverageAreasTable)
    .set(updates)
    .where(eq(coverageAreasTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(row);
});

router.delete("/admin/coverage-areas/:id", async (req, res) => {
  const id = String(req.params["id"]);
  await db.delete(coverageAreasTable).where(eq(coverageAreasTable.id, id));
  res.json({ ok: true });
});

export default router;
