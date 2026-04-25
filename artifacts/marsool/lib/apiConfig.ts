import { Platform } from "react-native";
import { setBaseUrl } from "@workspace/api-client-react";

const PROD_HOST = process.env.EXPO_PUBLIC_API_HOST ?? "zaboni.app";
const PROD = `https://${PROD_HOST}`;
const LOCAL_DEV = "http://localhost:8080";

export function initApiClient() {
  if (Platform.OS === "web") {
    setBaseUrl(null);
  } else {
    setBaseUrl(__DEV__ ? LOCAL_DEV : PROD);
  }
}

export function getApiBaseUrl(): string {
  if (Platform.OS === "web") return "";
  return __DEV__ ? LOCAL_DEV : PROD;
}

export function buildImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  const base = getApiBaseUrl();
  return `${base}${path}`;
}
