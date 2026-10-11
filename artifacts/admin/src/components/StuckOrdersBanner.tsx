import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type StuckOrders } from "@/lib/api";
import { playAlarm, notifyBrowser } from "@/lib/whatsappStatus";

type StuckOrder = StuckOrders["orders"][number];

/** Why this order is still waiting — read from the dispatcher's diagnostics. */
function waitReason(o: StuckOrder): { text: string; tone: string } {
  if (o.maxEligible === 0 || (o.maxEligible == null && o.lastError === "no_reachable_couriers")) {
    return { text: "ما في ولا مندوب متاح — اتصل بمندوب", tone: "text-red-700 dark:text-red-400" };
  }
  if (o.maxAccepted > 0) {
    return {
      text: `الإشعار وصل لـ ${o.maxAccepted} جهاز وما حدا قبل`,
      tone: "text-amber-700 dark:text-amber-400",
    };
  }
  if (o.lastError === "push_rejected") {
    return { text: "في مناديب بس الإشعار ما انبعت — مشكلة إشعارات", tone: "text-red-700 dark:text-red-400" };
  }
  return { text: "عم يدوّر…", tone: "text-muted-foreground" };
}

/**
 * Global banner (every admin page): orders still searching for a courier past
 * the alert threshold. Beeps and notifies once per newly-stuck order so the
 * admin can call a courier before the customer gives up.
 */
export default function StuckOrdersBanner() {
  const { data } = useQuery({
    queryKey: ["admin", "orders", "stuck"],
    queryFn: api.getStuckOrders,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });
  const alerted = useRef<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!data) return;
    const fresh = data.orders.filter((o) => !alerted.current.has(o.id));
    if (fresh.length > 0) {
      playAlarm();
      notifyBrowser(
        "⏳ زبوني — طلب ما لاقى مندوب",
        fresh.length === 1
          ? `${fresh[0]!.customerName} عم يستنّى من ${fresh[0]!.waitMinutes} دقيقة`
          : `${fresh.length} طلبات عم تستنّى مندوب`,
      );
      setCollapsed(false);
    }
    // Forget orders that are no longer stuck so a re-stuck order alerts again.
    alerted.current = new Set(data.orders.map((o) => o.id));
  }, [data]);

  if (!data || data.orders.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 px-4 py-3 text-right"
      >
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
        </span>
        <span className="flex-1 text-sm font-bold">
          ⏳ {data.orders.length.toLocaleString("ar-SY")} طلب عم يدوّر على مندوب من أكتر من{" "}
          {data.minutes.toLocaleString("ar-SY")} دقايق
        </span>
        <span className="flex-shrink-0 text-xs">
          المناديب المتصلين: {data.couriers.online.toLocaleString("ar-SY")} · فاضيين:{" "}
          <b className={data.couriers.free === 0 ? "text-red-600" : ""}>{data.couriers.free.toLocaleString("ar-SY")}</b>
        </span>
        <span className="text-xs opacity-60">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <ul className="divide-y divide-amber-200 border-t border-amber-200 dark:divide-amber-900 dark:border-amber-900">
          {data.orders.map((o) => {
            const reason = waitReason(o);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
                <span className="w-16 flex-shrink-0 font-bold tabular-nums">{o.waitMinutes} د</span>
                <span className="min-w-0 flex-1">
                  <b>{o.customerName}</b>
                  <a href={`tel:${o.customerPhone}`} className="mx-2 text-xs underline" dir="ltr">
                    {o.customerPhone}
                  </a>
                  <span className="text-xs opacity-80">
                    {o.orderType === "errand" ? "🛵 طلب حر" : "🍽️"} {o.summary}
                  </span>
                </span>
                <span className={`text-xs font-medium ${reason.tone}`}>{reason.text}</span>
                {o.nudged && <span className="text-[11px] opacity-60">انبعتله رسالة طمأنة ✓</span>}
                <Link href={`/orders?orderId=${o.id}`} className="text-xs font-bold underline">
                  فتح
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
