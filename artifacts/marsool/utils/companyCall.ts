import { Linking } from "react-native";
import { customFetch } from "@workspace/api-client-react";

/** The phone the dialer gets: keep a leading +, drop spaces and dashes. */
export const dialable = (raw: string) => raw.replace(/(?!^\+)[^0-9]/g, "");

/**
 * Call the other side of an order. With the office line on, `phone` is the company
 * number: first tell the server which order this call is about (a courier may carry
 * two), then dial. The line answers and puts the call through within a few seconds.
 * The note is best-effort — if it does not arrive, the line falls back to the
 * caller's newest order.
 */
export async function callAboutOrder(orderId: string, phone: string, viaCompanyLine: boolean): Promise<void> {
  const number = dialable(phone);
  if (!number) return;
  if (viaCompanyLine) {
    await Promise.race([
      customFetch("/api/calls/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => {}),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  await Linking.openURL(`tel:${number}`);
}
