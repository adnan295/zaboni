import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useWhatsAppAccounts,
  summarizeWhatsApp,
  playAlarm,
  notifyBrowser,
} from "@/lib/whatsappStatus";

const ALARM_REPEAT_MS = 60_000;

/**
 * Global WhatsApp watchdog, mounted in Layout so it runs on every admin page.
 * Polls every 5s (shared query). When no number is connected it shows a red
 * banner, beeps, fires a browser notification and flags the tab title; when a
 * single number drops while others still work it shows a dismissible notice.
 */
export default function WhatsAppAlertBanner() {
  const { data: accounts, isError } = useWhatsAppAccounts();
  const prevConnected = useRef<Set<string> | null>(null);
  const [droppedPhones, setDroppedPhones] = useState<string[]>([]);
  const lastAlarmAt = useRef(0);

  const summary = accounts ? summarizeWhatsApp(accounts) : null;
  const isDown = summary?.health === "down" || summary?.health === "none";

  // Detect individual numbers dropping (connected → anything else).
  useEffect(() => {
    if (!accounts) return;
    const nowConnected = new Set(accounts.filter((a) => a.status === "connected").map((a) => a.id));
    const prev = prevConnected.current;
    if (prev) {
      const dropped = accounts.filter((a) => prev.has(a.id) && !nowConnected.has(a.id));
      const removed = [...prev].filter((id) => !accounts.some((a) => a.id === id));
      if (dropped.length > 0) {
        const phones = dropped.map((a) => a.phone ?? a.id);
        setDroppedPhones((p) => Array.from(new Set([...p, ...phones])));
        playAlarm();
        notifyBrowser(
          "⚠️ زبوني — انقطع رقم واتساب",
          nowConnected.size > 0
            ? `${phones.join("، ")} انقطع. الإرسال مستمر عبر ${nowConnected.size} رقم.`
            : `${phones.join("، ")} انقطع. ما في ولا رقم شغّال — رموز التحقق ما عم توصل!`,
        );
      }
      // A number the admin deleted on purpose is not an outage.
      if (removed.length > 0 && dropped.length === 0) setDroppedPhones([]);
    }
    prevConnected.current = nowConnected;
  }, [accounts]);

  // While fully down: repeat the alarm every minute so it can't be missed.
  useEffect(() => {
    if (!isDown) return;
    const ring = () => {
      if (Date.now() - lastAlarmAt.current < ALARM_REPEAT_MS - 1000) return;
      lastAlarmAt.current = Date.now();
      playAlarm();
    };
    ring();
    const t = setInterval(ring, ALARM_REPEAT_MS);
    return () => clearInterval(t);
  }, [isDown]);

  // Flag the browser tab title while down.
  useEffect(() => {
    if (!isDown) return;
    const base = document.title.replace(/^⚠️ واتساب واقف · /, "");
    document.title = `⚠️ واتساب واقف · ${base}`;
    return () => {
      document.title = document.title.replace(/^⚠️ واتساب واقف · /, "");
    };
  }, [isDown]);

  // Everything back to fully connected → clear the "dropped" notice.
  useEffect(() => {
    if (summary && summary.connected === summary.total && summary.total > 0) setDroppedPhones([]);
  }, [summary?.connected, summary?.total]);

  if (isError || !summary) return null;

  if (isDown) {
    return (
      <div
        role="alert"
        className="sticky top-0 z-30 mb-4 flex items-center gap-3 rounded-lg border-2 border-red-500 bg-red-600 px-4 py-3 text-white shadow-lg"
      >
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {summary.health === "none"
              ? "ما في ولا رقم واتساب مربوط — رموز التحقق ما عم توصل للزباين!"
              : "واتساب واقف — كل الأرقام منقطعة ورموز التحقق ما عم توصل للزباين!"}
          </p>
          <p className="mt-0.5 text-xs opacity-90">
            الإرسال حالياً عبر SMS فقط (إذا البوابة مضبوطة). اربط رقم جديد فوراً.
          </p>
        </div>
        <Link
          href="/whatsapp"
          className="flex-shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
        >
          إصلاح الآن
        </Link>
      </div>
    );
  }

  if (droppedPhones.length > 0) {
    return (
      <div
        role="status"
        className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <span className="text-lg leading-none">⚠️</span>
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">انقطع رقم: {droppedPhones.join("، ")}</span>
          <span className="opacity-80">
            {" "}— الإرسال شغّال تلقائياً عبر {summary.connected} رقم احتياطي.
          </span>
        </div>
        <Link href="/whatsapp" className="flex-shrink-0 text-xs font-bold underline">
          عرض
        </Link>
        <button
          onClick={() => setDroppedPhones([])}
          className="flex-shrink-0 text-xs opacity-60 hover:opacity-100"
          aria-label="إخفاء"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
