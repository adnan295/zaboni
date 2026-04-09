import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/config/contact", (_req, res) => {
  res.json({
    phone: process.env.ADMIN_PHONE || "+963999000111",
    whatsapp: process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE || "+963999000111",
  });
});

export default router;
