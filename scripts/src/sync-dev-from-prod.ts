/**
 * Sync dev database from production.
 * Copies restaurants and menu_items from PROD_DATABASE_URL → DATABASE_URL (dev).
 *
 * Usage:
 *   pnpm run db:sync-from-prod
 *
 * Required env vars:
 *   DATABASE_URL      – dev database connection string
 *   PROD_DATABASE_URL – production database connection string
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, like } from "drizzle-orm";
import { restaurantsTable, menuItemsTable } from "@workspace/db/schema";

const { Pool } = pg;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Environment variable ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

const PROD_DATABASE_URL = requireEnv("PROD_DATABASE_URL");
const DEV_DATABASE_URL = requireEnv("DATABASE_URL");

if (PROD_DATABASE_URL === DEV_DATABASE_URL) {
  console.error("❌ PROD_DATABASE_URL and DATABASE_URL are the same. Aborting to prevent data loss.");
  process.exit(1);
}

const prodPool = new Pool({ connectionString: PROD_DATABASE_URL });
const devPool = new Pool({ connectionString: DEV_DATABASE_URL });

const prodDb = drizzle(prodPool);
const devDb = drizzle(devPool);

async function syncRestaurants(): Promise<string[]> {
  console.log("\n📦 Fetching restaurants from production (excluding test data)...");
  const restaurants = await prodDb
    .select()
    .from(restaurantsTable)
    .where(like(restaurantsTable.id, "rest_%"));
  console.log(`   Found ${restaurants.length} restaurant(s).`);

  if (restaurants.length === 0) return [];

  console.log("💾 Upserting restaurants into dev...");
  await devDb
    .insert(restaurantsTable)
    .values(restaurants)
    .onConflictDoUpdate({
      target: restaurantsTable.id,
      set: {
        name: sql`excluded.name`,
        nameAr: sql`excluded.name_ar`,
        category: sql`excluded.category`,
        categoryAr: sql`excluded.category_ar`,
        rating: sql`excluded.rating`,
        reviewCount: sql`excluded.review_count`,
        deliveryTime: sql`excluded.delivery_time`,
        deliveryFee: sql`excluded.delivery_fee`,
        minOrder: sql`excluded.min_order`,
        image: sql`excluded.image`,
        tags: sql`excluded.tags`,
        isOpen: sql`excluded.is_open`,
        discount: sql`excluded.discount`,
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
      },
    });

  return restaurants.map((r) => r.id);
}

async function syncMenuItems(restaurantIds: string[]): Promise<number> {
  console.log("\n🍽️  Fetching menu items from production (excluding test data)...");
  const items = await prodDb
    .select()
    .from(menuItemsTable)
    .where(like(menuItemsTable.id, "item_%"));
  console.log(`   Found ${items.length} menu item(s).`);

  if (items.length === 0) return 0;

  const filteredItems = items.filter((item) =>
    restaurantIds.includes(item.restaurantId),
  );
  console.log(
    `   Keeping ${filteredItems.length} item(s) belonging to synced restaurants.`,
  );

  if (filteredItems.length === 0) return 0;

  console.log("💾 Upserting menu items into dev...");

  const CHUNK = 100;
  for (let i = 0; i < filteredItems.length; i += CHUNK) {
    const chunk = filteredItems.slice(i, i + CHUNK);
    await devDb
      .insert(menuItemsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: menuItemsTable.id,
        set: {
          restaurantId: sql`excluded.restaurant_id`,
          name: sql`excluded.name`,
          nameAr: sql`excluded.name_ar`,
          description: sql`excluded.description`,
          descriptionAr: sql`excluded.description_ar`,
          price: sql`excluded.price`,
          image: sql`excluded.image`,
          category: sql`excluded.category`,
          categoryAr: sql`excluded.category_ar`,
          isPopular: sql`excluded.is_popular`,
        },
      });
  }

  return filteredItems.length;
}

async function main() {
  console.log("🔄 Starting sync from production → dev");
  console.log("   Dev DB  :", DEV_DATABASE_URL.replace(/:\/\/[^@]+@/, "://***@"));
  console.log("   Prod DB :", PROD_DATABASE_URL.replace(/:\/\/[^@]+@/, "://***@"));

  try {
    const restaurantIds = await syncRestaurants();
    const menuItemCount = await syncMenuItems(restaurantIds);

    console.log("\n✅ Sync complete!");
    console.log(`   Restaurants : ${restaurantIds.length}`);
    console.log(`   Menu items  : ${menuItemCount}`);
  } catch (err) {
    console.error("\n❌ Sync failed:", err);
    process.exitCode = 1;
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

main();
