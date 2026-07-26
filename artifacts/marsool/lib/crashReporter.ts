import AsyncStorage from "@react-native-async-storage/async-storage";

// Diagnostic crash reporter.
//
// React's <ErrorBoundary> only catches errors thrown *during render*. Errors
// thrown from async callbacks, promise chains, timers or event handlers escape
// it and, in a release build, are handed to React Native's global error handler
// which terminates the app silently ("the app just closes"). This module
// installs our own global handler so those fatal errors are (1) persisted so we
// can show them on the next launch even if the current process dies, and (2)
// surfaced immediately on-screen so the reason is visible and screenshot-able
// instead of vanishing.

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

export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  // `ErrorUtils` is a React Native global present in both JSC and Hermes.
  const g = global as unknown as {
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
}
