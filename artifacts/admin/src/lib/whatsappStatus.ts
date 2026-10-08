import { useQuery } from "@tanstack/react-query";
import { api, type WAAccount } from "@/lib/api";

// One shared live query for the WhatsApp numbers. Layout, Dashboard and the
// WhatsApp page all use this key, so they share a single 5-second poll.
export const WA_ACCOUNTS_QUERY_KEY = ["admin", "whatsapp", "accounts"] as const;
export const WA_POLL_MS = 5000;

export function useWhatsAppAccounts() {
  return useQuery<WAAccount[]>({
    queryKey: WA_ACCOUNTS_QUERY_KEY,
    queryFn: api.getWhatsAppAccounts,
    refetchInterval: WA_POLL_MS,
    refetchIntervalInBackground: true,
  });
}

export type WaHealth = "ok" | "no_backup" | "degraded" | "down" | "none";

export function summarizeWhatsApp(accounts: WAAccount[]) {
  const connected = accounts.filter((a) => a.status === "connected").length;
  const total = accounts.length;
  let health: WaHealth;
  if (total === 0) health = "none";
  else if (connected === 0) health = "down";
  else if (connected < total) health = "degraded";
  else if (connected === 1) health = "no_backup";
  else health = "ok";
  return { connected, total, health };
}

/** Human explanation of why a number is not connected, from its last disconnect code. */
export function disconnectReason(a: WAAccount): string | null {
  if (a.status === "connected") return null;
  if (a.status === "qr") return "بانتظار مسح الـ QR";
  switch (a.lastDisconnectCode) {
    case 403:
      return "الرقم محظور من واتساب — احذفه وضيف رقم جديد";
    case 401:
      return "الرقم انفصل (تسجيل خروج من الموبايل) — احذفه وامسح QR جديد";
    case 405:
      return "واتساب رافض اتصال السيرفر (حظر منطقة) — تأكد إن بروكسي WARP شغّال";
    case 440:
      return "الرقم انفتح بجهاز تاني واستبدل الجلسة";
    default:
      if (a.status === "disconnected") return "منقطع — احذفه وأعد الربط";
      if ((a.reconnectAttempts ?? 0) >= 3)
        return `عم يحاول يرجع يتصل (محاولة ${a.reconnectAttempts})`;
      return "جاري الاتصال...";
  }
}

export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `قبل ${sec} ث`;
  const min = Math.round(sec / 60);
  if (min < 60) return `قبل ${min} د`;
  const h = Math.round(min / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.round(h / 24)} يوم`;
}

/** Short alarm beep via Web Audio — no audio asset needed. */
export function playAlarm() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Autoplay blocked until the admin interacts with the page — the banner still shows.
  }
}

export function notifyBrowser(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, tag: "zaboni-whatsapp", requireInteraction: true });
    }
  } catch {
    // ignore
  }
}
