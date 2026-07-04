import { useState, useEffect, useCallback, useRef } from "react";
import { getToken } from "@/lib/api";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export interface WebPushResult {
  pushPermission: PushPermission;
  pushEnabled: boolean;
  swReady: boolean;
  requestPush: () => Promise<void>;
  disablePush: () => Promise<void>;
}

const BASE = import.meta.env.BASE_URL as string;
const PUSH_PROMPTED_KEY = "restaurant_portal_push_prompted_v1";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return buffer;
}

async function subscribeWithReg(reg: ServiceWorkerRegistration): Promise<void> {
  const res = await fetch("/api/restaurant-portal/vapid-public-key");
  const { publicKey } = (await res.json()) as { publicKey: string };

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subJson = sub.toJSON();
  const token = getToken();
  await fetch("/api/restaurant-portal/push-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }),
  });
}

export function useWebPush(authed: boolean): WebPushResult {
  const [pushPermission, setPushPermission] = useState<PushPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission as PushPermission;
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!authed) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushPermission("unsupported");
      return;
    }

    navigator.serviceWorker
      .register(BASE + "sw.js", { scope: BASE })
      .then(async (reg) => {
        regRef.current = reg;
        setSwReady(true);
        const sub = await reg.pushManager.getSubscription();
        setPushEnabled(!!sub);
        const perm = Notification.permission as PushPermission;
        setPushPermission(perm);

        // Auto-prompt once on first login if the browser hasn't been asked yet
        if (!sub && perm === "default") {
          const alreadyPrompted = localStorage.getItem(PUSH_PROMPTED_KEY);
          if (!alreadyPrompted) {
            localStorage.setItem(PUSH_PROMPTED_KEY, "1");
            // Small delay so the portal has fully rendered before the browser dialog appears
            setTimeout(() => {
              void (async () => {
                const permission = await Notification.requestPermission();
                setPushPermission(permission as PushPermission);
                if (permission !== "granted") return;
                await subscribeWithReg(reg);
                setPushEnabled(true);
              })();
            }, 1500);
          }
        }
      })
      .catch(() => {
        setPushPermission("unsupported");
      });
  }, [authed]);

  const requestPush = useCallback(async () => {
    const reg = regRef.current;
    if (!reg) return;
    const permission = await Notification.requestPermission();
    setPushPermission(permission as PushPermission);
    if (permission !== "granted") return;
    await subscribeWithReg(reg);
    setPushEnabled(true);
  }, []);

  const disablePush = useCallback(async () => {
    const reg = regRef.current;
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const token = getToken();
      await fetch("/api/restaurant-portal/push-subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setPushEnabled(false);
  }, []);

  return { pushPermission, pushEnabled, swReady, requestPush, disablePush };
}
