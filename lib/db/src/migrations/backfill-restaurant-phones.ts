import { db } from "../index";
import { sql } from "drizzle-orm";

export async function backfillRestaurantPhones() {
  const result = await db.execute(sql`
    UPDATE restaurants SET phone = CASE id
      WHEN 'rest_17764298014413c63k' THEN '0944 123 456'
      WHEN 'rest_1776428543061tjcm2' THEN '0933 456 789'
      WHEN 'rest_1776428350944706jl' THEN '0962 345 678'
      WHEN 'rest_1776357861400znm0x' THEN '0944 567 890'
      WHEN 'rest_1776427717818xuh4k' THEN '0933 789 012'
      WHEN 'rest_17764280503145ld3m' THEN '0962 890 123'
      WHEN 'rest_17764292236473xtwp' THEN '0944 901 234'
      WHEN 'rest_177642718566265ue2' THEN '0933 012 345'
      WHEN 'rest_1776426562793s053z' THEN '0962 123 456'
      WHEN 'rest_17764269465643q95t' THEN '0944 234 567'
      WHEN 'rest_177642945590766g9j' THEN '0933 345 678'
      WHEN 'rest_1776358234977jpg6c' THEN '0962 456 789'
      WHEN 'rest_1776359271827pp76u' THEN '0944 567 891'
      WHEN 'rest_1776429627993mei5f' THEN '0933 678 901'
      WHEN 'rest_17764299955088ts11' THEN '0962 789 012'
      WHEN 'rest_17764309442699t5sp' THEN '0944 890 123'
      WHEN 'rest_1776431351406yum9f' THEN '0933 901 234'
      WHEN 'rest_1776431791790h4l5n' THEN '0962 012 345'
      WHEN 'rest_1776427516464nlc37' THEN '0944 345 678'
      WHEN 'rest_1776357506682v2o5c' THEN '0933 456 780'
      WHEN 'rest_17763589213710taah' THEN '0962 567 891'
      ELSE phone
    END
    WHERE phone IS NULL OR phone = ''
  `);

  const updated = result.rowCount ?? 0;
  if (updated > 0) {
    console.log(`[migration] Backfilled phone numbers for ${updated} restaurant(s).`);
  } else {
    console.log("[migration] All restaurants already have phone numbers — skipping backfill.");
  }
}
