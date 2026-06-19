import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addMenuItemAvailability() {
  await db.execute(sql`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true
  `);
  console.log("[migration] menu_items.is_available column ensured.");
}
