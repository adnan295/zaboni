import { db } from "../index";
import { sql } from "drizzle-orm";

export async function addCoverageAreas(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS coverage_areas (
      id text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      points jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  console.log("[migration] coverage_areas table ensured.");
}
