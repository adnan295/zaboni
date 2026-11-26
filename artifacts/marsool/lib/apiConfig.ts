import { Platform } from "react-native";
import Constants from "expo-constants";
import { setBaseUrl, setDefaultHeaders } from "@workspace/api-client-react";

/** This app's version ("1.0.23"), from the store build. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

const PROD_HOST = process.env.EXPO_PUBLIC_API_HOST ?? "zaboni.site";
const PROD = `https://${PROD_HOST}`;
const DEV_HOST = process.env.EXPO_PUBLIC_DOMAIN;
const DEV_BASE = DEV_HOST ? `https://${DEV_HOST}` : "http://localhost:8080";

export function initApiClient() {
  // Tells the server which app this is: newer apps get the newer order stages,
  // older ones are served as before (api-server lib/appVersion).
  setDefaultHeaders({ "X-Zaboni-App": `${APP_VERSION} ${Platform.OS}` });
  if (Platform.OS === "web") {
    setBaseUrl(null);
  } else {
    setBaseUrl(__DEV__ ? DEV_BASE : PROD);
  }
}

export function getApiBaseUrl(): string {
  if (Platform.OS === "web") return "";
  return __DEV__ ? DEV_BASE : PROD;
}

export function buildImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  const base = getApiBaseUrl();
  return `${base}${path}`;
}

/**
 * Resolve a stored avatar value into a loadable image URI.
 *
 * Avatars may be stored in several shapes depending on where they were set:
 * a full `http(s)://…` URL (e.g. from the admin panel), a rooted API path
 * (`/api/storage/…` or `/storage/…`), or — for images uploaded from the app —
 * a bare object path like `uploads/<id>`. The bare path is what the upload
 * helper returns; it must be expanded to the public serving endpoint and
 * prefixed with the API base so it loads on native (where there is no page
 * origin). Local picker URIs (`file://`, `content://`, `data:`) are returned
 * untouched for pre-upload previews.
 */
export function buildAvatarUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (
    value.startsWith("http") ||
    value.startsWith("file:") ||
    value.startsWith("content:") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  const base = getApiBaseUrl();
  if (value.startsWith("/api/")) return `${base}${value}`;
  if (value.startsWith("/")) return `${base}/api${value}`;
  return `${base}/api/storage/public-objects/${value}`;
}
