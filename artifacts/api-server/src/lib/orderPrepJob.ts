// Every few seconds: orders a minute old with no courier become «عم يتحضّر» for
// the customer — or, with that switched off, orders five minutes old are cancelled —
// the customer, and the admin's WhatsApp gets the restaurant's number to order
// it. Ten minutes later with still no courier, a second, louder alert.
// See lib/orderPrep.ts for the rules.

import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { whatsappManager } from "./whatsapp";
import { getCrashAlertPhone } from "./crashReports";
import { maskCourierPhone } from "./callBridge";
import { autoPrepActive, dueSecondAlerts, expireUnsent, getAutoPrep, hideCourierUntilPickup, prepAlertText, setAutoPrepNow, startDuePrep, type PrepOrder } from "./orderPrep";
import { notifyCouriersOrderTaken, notifyOrderUpdate, sendOrderPush } from "../orders/server";

const TICK_MS = 15_000;

async function alertAdmin(o: PrepOrder, second: boolean): Promise<void> {
  const phone = (await getCrashAlertPhone().catch(() => "")).trim();
  if (!phone) return;
  await whatsappManager.sendMessage(phone, prepAlertText(o, second)).catch(() => false);
}

export async function runOrderPrepTick(now = new Date()): Promise<void> {
  // Off, or outside the admin's hours: orders wait for a courier as before. Orders
  // already preparing still get the 10-minute alert.
  const active = autoPrepActive(await getAutoPrep(), now);
  setAutoPrepNow(active);
  // Off: «جاري إرسال طلبك للمطعم», and after five minutes with nobody on it, cancelled.
  for (const o of active ? [] : await expireUnsent(now)) {
    const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, o.id)).limit(1);
    if (row) notifyOrderUpdate(o.userId, { ...row, cancelNote: "auto_expired" });
    notifyCouriersOrderTaken(o.id);
    void sendOrderPush(o.userId, "😔 ما قدرنا نوصّل طلبك للمطعم هلق، فلغيناه وما رح تدفع شي. جرّب كمان شوي", o.id);
  }
  for (const o of active ? await startDuePrep(now) : []) {
    const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, o.id)).limit(1);
    if (row) notifyOrderUpdate(o.userId, hideCourierUntilPickup(maskCourierPhone(row)));
    void sendOrderPush(o.userId, "👨‍🍳 طلبك عم يتحضّر بالمطعم", o.id);
    void alertAdmin(o, false);
  }
  for (const o of await dueSecondAlerts(now)) void alertAdmin(o, true);
}

export function startOrderPrepJob(): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    runOrderPrepTick()
      .catch((err) => logger.warn({ err }, "[order-prep] tick failed"))
      .finally(() => { running = false; });
  }, TICK_MS);
}
