import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/lib/apiConfig";

// Diagnostic crash reporter.
//
// React's <ErrorBoundary> only catches errors thrown *during render*. Errors
// thrown from async callbacks, promise chains, timers or event handlers escape
// it and, in a release build, are handed to React Native's global error handler
// which terminates the app silently ("the app just closes"). This module
// installs our own global handler so those fatal errors are (1) persisted so we
// can show them on the next launch even if the current process dies, and (2)
// surfaced immediately on-screen so the reason is visible and screenshot-able
// instead of vanishing, and (3) sent to the server so the admin sees crashes
// (and gets alerted) before anyone has to complain.

export type FatalInfo = {
  message: string;
  stack: string;
  isFatal: boolean;
  at: number;
};

const STORAGE_KEY = "@zaboni_last_fatal_v1";

let listener: ((info: FatalInfo) => void) | null = null;
let installed = false;

export function setFatalListener(fn: ((info: FatalInfo) => void) | null): void {
  listener = fn;
}

export async function getStoredFatal(): Promise<FatalInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FatalInfo) : null;
  } catch {
    return null;
  }
}

export async function clearStoredFatal(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Server upload ─────────────────────────────────────────────────────────
// Reports go into a small persisted queue first: a fatal error usually kills
// the process before a request can finish, so whatever is left is sent on the
// next launch (and when the phone was offline, on the launch after that).

export type CrashKind = "fatal" | "render" | "error";
type QueuedCrash = { kind: CrashKind; message: string; stack: string; at: number; route: string; role: string };

const QUEUE_KEY = "@zaboni_crash_queue_v1";
const AUTH_TOKEN_KEY = "@marsool_jwt";
const MAX_QUEUE = 10;

let context = { route: "", role: "" };
let flushing = false;

/** Where the user is and in which mode, attached to any crash that follows. */
export function setCrashContext(next: { route: string; role: string }): void {
  context = next;
}

function deviceInfo() {
  const c = (Platform.constants ?? {}) as { Brand?: string; Manufacturer?: string; Model?: string; Release?: string; systemName?: string };
  let appVersion = "";
  let updateId = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    appVersion = require("expo-constants").default?.expoConfig?.version ?? "";
  } catch { /* ignore */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    updateId = require("expo-updates").updateId ?? "embedded";
  } catch { /* ignore */ }
  return {
    platform: Platform.OS,
    osVersion: String(c.Release ?? Platform.Version ?? ""),
    device: [c.Manufacturer ?? c.Brand, c.Model].filter(Boolean).join(" "),
    appVersion,
    updateId,
  };
}

async function readQueue(): Promise<QueuedCrash[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const list = raw ? (JSON.parse(raw) as QueuedCrash[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function flushCrashQueue(): Promise<void> {
  if (flushing || Platform.OS === "web") return;
  flushing = true;
  try {
    let queue = await readQueue();
    if (!queue.length) return;
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY).catch(() => null);
    const info = deviceInfo();
    while (queue.length) {
      const item = queue[0]!;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      let res: Response;
      try {
        res = await fetch(`${getApiBaseUrl()}/api/app/crash`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ ...info, ...item }),
        });
      } catch {
        return; // offline — keep the queue for next launch
      } finally {
        clearTimeout(timer);
      }
      // 4xx won't get better by retrying; 5xx/429 waits for next launch.
      if (res.status >= 500 || res.status === 429) return;
      queue = queue.slice(1);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(() => {});
    }
  } catch {
    // Reporting must never cause a crash of its own.
  } finally {
    flushing = false;
  }
}

/** Queue a crash for the server and try to send it right away. */
export function reportCrash(kind: CrashKind, error: unknown, extraStack = ""): void {
  try {
    if (__DEV__) return;
    const err = error as { message?: unknown; stack?: unknown } | null | undefined;
    const item: QueuedCrash = {
      kind,
      message: String(err?.message ?? error ?? "Unknown error").slice(0, 500),
      stack: (String(err?.stack ?? "") + (extraStack ? `\n--- component stack ---${extraStack}` : "")).slice(0, 4000),
      at: Date.now(),
      route: context.route,
      role: context.role,
    };
    void readQueue()
      .then((queue) => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, item].slice(-MAX_QUEUE))))
      .then(() => flushCrashQueue())
      .catch(() => {});
  } catch {
    // ignore
  }
}

export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  // Send whatever the previous run couldn't (it likely died mid-crash).
  setTimeout(() => void flushCrashQueue(), 3_000);

  try {
  // `ErrorUtils` is a React Native global present in both JSC and Hermes.
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const ErrorUtilsRef = g.ErrorUtils;
  if (!ErrorUtilsRef || typeof ErrorUtilsRef.setGlobalHandler !== "function") return;

  const prev = ErrorUtilsRef.getGlobalHandler?.();

  ErrorUtilsRef.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    const err = error as { message?: unknown; stack?: unknown } | null | undefined;
    const info: FatalInfo = {
      message: String(err?.message ?? error ?? "Unknown error"),
      stack: String(err?.stack ?? ""),
      isFatal: !!isFatal,
      at: Date.now(),
    };

    // Best-effort persist so the reason survives even if the process is killed.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(info)).catch(() => {});
    reportCrash(isFatal ? "fatal" : "error", error);

    // Try to show it right now.
    try {
      listener?.(info);
    } catch {
      // ignore
    }

    // Keep the default logging behaviour, but for a *fatal* error in a release
    // build do NOT delegate to the default handler — the default handler tears
    // the app down, which is exactly the silent close we are trying to replace.
    // In dev we still delegate so the red box keeps working.
    if (!isFatal || __DEV__) {
      if (typeof prev === "function") {
        try {
          prev(error, isFatal);
        } catch {
          // ignore
        }
      }
    }
  });
  } catch {
    // Diagnostics must never prevent the app from starting.
  }
}
