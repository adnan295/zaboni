import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addAddonGroups() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS menu_item_option_groups (
      id text PRIMARY KEY,
      menu_item_id text NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      name_ar text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_miog_menu_item_id ON menu_item_option_groups(menu_item_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS menu_item_options (
      id text PRIMARY KEY,
      group_id text NOT NULL REFERENCES menu_item_option_groups(id) ON DELETE CASCADE,
      name_ar text NOT NULL,
      extra_price integer NOT NULL DEFAULT 0,
      is_default boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_mio_group_id ON menu_item_options(group_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_item_options (
      id text PRIMARY KEY,
      order_item_id text NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      option_id text NOT NULL,
      name_ar text NOT NULL,
      extra_price integer NOT NULL DEFAULT 0
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_oio_order_item_id ON order_item_options(order_item_id)
  `);

  await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS note text`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_note text`);

  console.log("[migration] add-addon-groups: all tables and columns ensured.");
}
