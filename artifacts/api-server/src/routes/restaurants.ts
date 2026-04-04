import { Router, type IRouter } from "express";
import { db, restaurantsTable, menuItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/restaurants", async (_req, res) => {
  const rows = await db.select().from(restaurantsTable).orderBy(restaurantsTable.rating);
  res.json(rows);
});

router.get("/restaurants/:id", async (req, res) => {
  const { id } = req.params;
  const rows = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, id));
  if (rows.length === 0) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  res.json(rows[0]);
});

router.get("/restaurants/:id/menu", async (req, res) => {
  const { id } = req.params;
  const items = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.restaurantId, id));
  res.json(items);
});

export default router;
