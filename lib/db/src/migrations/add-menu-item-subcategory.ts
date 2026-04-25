import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addMenuItemSubcategory() {
  await db.execute(sql`
    ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS subcategory text,
      ADD COLUMN IF NOT EXISTS subcategory_ar text
  `);
  console.log("[migration] menu_items.subcategory columns ensured.");
}
