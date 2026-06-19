import { Storage } from "@google-cloud/storage";
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

const imgBuffer = readFileSync("attached_assets/d8949803-4590-4474-9952-fd5d99895652_1781903497887.jpeg");
const bucket = "replit-objstore-55ff7d0a-e715-4d9a-b9aa-3d6d7ae80f97";
const objectName = "public/food-uploads/chicken-rice-test.jpg";

const storage = new Storage();
const file = storage.bucket(bucket).file(objectName);
await file.save(imgBuffer, { contentType: "image/jpeg", resumable: false });
console.log("UPLOADED");

const token = jwt.sign(
  { restaurantUserId: "ruser_test001", restaurantId: "rest_1776357861400znm0x", phone: "+963911000099", tokenType: "restaurant_portal" },
  process.env["JWT_SECRET"]!,
  { expiresIn: "1h" }
);
console.log("TOKEN=" + token);
