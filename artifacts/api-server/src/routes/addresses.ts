import { Router, type IRouter } from "express";
import { db, addressesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const upsertAddressSchema = z.object({
  label: z.string().min(1),
  address: z.string().min(1),
  isDefault: z.boolean().optional().default(false),
});

function getUserId(req: import("express").Request): string {
  return (req.query["userId"] as string) || "guest";
}

router.get("/addresses", async (req, res) => {
  const userId = getUserId(req);
  const rows = await db
    .select()
    .from(addressesTable)
    .where(eq(addressesTable.userId, userId));
  res.json(rows);
});

router.post("/addresses", async (req, res) => {
  const userId = getUserId(req);
  const body = upsertAddressSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const id = `addr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  if (body.data.isDefault) {
    await db
      .update(addressesTable)
      .set({ isDefault: false })
      .where(eq(addressesTable.userId, userId));
  }

  const existing = await db
    .select()
    .from(addressesTable)
    .where(eq(addressesTable.userId, userId));

  const newAddr = {
    id,
    userId,
    label: body.data.label,
    address: body.data.address,
    isDefault: existing.length === 0 ? true : (body.data.isDefault ?? false),
  };

  const rows = await db.insert(addressesTable).values(newAddr).returning();
  res.status(201).json(rows[0]);
});

router.put("/addresses/:id", async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const body = upsertAddressSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const rows = await db
    .update(addressesTable)
    .set({ label: body.data.label, address: body.data.address })
    .where(and(eq(addressesTable.id, id), eq(addressesTable.userId, userId)))
    .returning();

  if (rows.length === 0) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  res.json(rows[0]);
});

router.delete("/addresses/:id", async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;

  const rows = await db
    .delete(addressesTable)
    .where(and(eq(addressesTable.id, id), eq(addressesTable.userId, userId)))
    .returning();

  if (rows.length === 0) {
    res.status(404).json({ error: "Address not found" });
    return;
  }

  const remaining = await db
    .select()
    .from(addressesTable)
    .where(eq(addressesTable.userId, userId));

  if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
    await db
      .update(addressesTable)
      .set({ isDefault: true })
      .where(eq(addressesTable.id, remaining[0].id));
  }

  res.status(204).send();
});

router.patch("/addresses/:id/default", async (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;

  await db
    .update(addressesTable)
    .set({ isDefault: false })
    .where(eq(addressesTable.userId, userId));

  const rows = await db
    .update(addressesTable)
    .set({ isDefault: true })
    .where(and(eq(addressesTable.id, id), eq(addressesTable.userId, userId)))
    .returning();

  if (rows.length === 0) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  res.json(rows[0]);
});

export default router;
