import { Platform } from "react-native";
import { setBaseUrl } from "@workspace/api-client-react";

const LOCAL_DEV = "http://localhost:8080";
const PROD = `https://${process.env.EXPO_PUBLIC_API_HOST}`;

export function initApiClient() {
  if (Platform.OS === "web") {
    setBaseUrl(null);
  } else {
    const host = process.env.EXPO_PUBLIC_API_HOST;
    setBaseUrl(host ? PROD : LOCAL_DEV);
  }
}

export function getApiBaseUrl(): string {
  if (Platform.OS === "web") return "";
  const host = process.env.EXPO_PUBLIC_API_HOST;
  return host ? PROD : LOCAL_DEV;
}

export function buildImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  const base = getApiBaseUrl();
  return `${base}${path}`;
}
