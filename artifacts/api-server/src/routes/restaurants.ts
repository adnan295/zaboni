import { Router, type IRouter } from "express";
import { db, restaurantsTable, menuItemsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/restaurants", async (req, res) => {
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const category = typeof req.query["category"] === "string" ? req.query["category"].trim() : "";

  let query = db.select().from(restaurantsTable).$dynamic();

  const conditions = [];
  if (search) {
    conditions.push(
      sql`(${restaurantsTable.name} ILIKE ${"%" + search + "%"} OR ${restaurantsTable.nameAr} ILIKE ${"%" + search + "%"} OR ${restaurantsTable.category} ILIKE ${"%" + search + "%"} OR ${restaurantsTable.categoryAr} ILIKE ${"%" + search + "%"})`
    );
  }
  if (category) {
    conditions.push(
      sql`(${restaurantsTable.category} ILIKE ${"%" + category + "%"} OR ${restaurantsTable.categoryAr} ILIKE ${"%" + category + "%"})`
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = await query.orderBy(desc(restaurantsTable.rating));
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
