import { objectStorageClient } from "./lib/objectStorage";
import { writeFileSync } from "fs";

async function main() {
  const bucket = "replit-objstore-55ff7d0a-e715-4d9a-b9aa-3d6d7ae80f97";
  const objectName = "public/promo-banners/rest_1776357861400znm0x/1781903687087-897dbb55.png";
  const file = objectStorageClient.bucket(bucket).file(objectName);
  const [buffer] = await file.download();
  writeFileSync("promo-result.png", buffer);
  console.log("DONE: promo-result.png (" + buffer.length + " bytes)");
}
main().catch(e => { console.error(e.message); process.exit(1); });
