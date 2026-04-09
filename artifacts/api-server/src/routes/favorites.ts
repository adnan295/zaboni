import { Router, type IRouter, type Request } from "express";
import { db, userFavoritesTable, restaurantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function resolveUserId(req: Request): string {
  return req.auth!.userId;
}

router.get("/favorites", async (req, res) => {
  const userId = resolveUserId(req);
  const rows = await db
    .select({ restaurant: restaurantsTable })
    .from(userFavoritesTable)
    .innerJoin(restaurantsTable, eq(userFavoritesTable.restaurantId, restaurantsTable.id))
    .where(eq(userFavoritesTable.userId, userId))
    .orderBy(userFavoritesTable.createdAt);
  res.json(rows.map((r) => r.restaurant));
});

router.post("/favorites/:restaurantId", async (req, res) => {
  const userId = resolveUserId(req);
  const { restaurantId } = req.params;

  const restaurant = await db
    .select({ id: restaurantsTable.id })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, restaurantId))
    .limit(1);
  if (restaurant.length === 0) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }

  await db
    .insert(userFavoritesTable)
    .values({ userId, restaurantId })
    .onConflictDoNothing();

  res.status(201).json({ ok: true });
});

router.delete("/favorites/:restaurantId", async (req, res) => {
  const userId = resolveUserId(req);
  const { restaurantId } = req.params;
  await db
    .delete(userFavoritesTable)
    .where(and(eq(userFavoritesTable.userId, userId), eq(userFavoritesTable.restaurantId, restaurantId)));
  res.status(204).end();
});

export default router;
