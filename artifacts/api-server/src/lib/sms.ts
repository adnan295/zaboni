import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";

export interface SmsGatewayConfig {
  url: string;
  apiKey: string;
  sender: string;
  method: "GET" | "POST";
}

async function getGatewayConfig(): Promise<SmsGatewayConfig | null> {
  const rows = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const url = map["sms_gateway_url"];
  if (!url) return null;

  return {
    url,
    apiKey: map["sms_gateway_api_key"] ?? "",
    sender: map["sms_gateway_sender"] ?? "",
    method: (map["sms_gateway_method"] ?? "POST") === "GET" ? "GET" : "POST",
  };
}

function interpolateUrl(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? encodeURIComponent(vars[key]) : "",
  );
}

function interpolatePlain(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : ""));
}

const PLACEHOLDER_RE = /\{(phone|message|apiKey|sender)\}/;

export async function sendSmsViaGateway(phone: string, message: string): Promise<void> {
  const config = await getGatewayConfig();

  if (!config) {
    if (process.env["NODE_ENV"] !== "production") {
      logger.info({ phone, message }, "[sms] DEV MODE — SMS");
      return;
    }
    throw new Error(
      "SMS gateway is not configured. Please set sms_gateway_url in the admin settings panel.",
    );
  }

  const vars: Record<string, string> = {
    phone,
    message,
    apiKey: config.apiKey,
    sender: config.sender,
  };

  if (config.method === "GET") {
    const hasPlaceholders = PLACEHOLDER_RE.test(config.url);
    let finalUrl: string;

    if (hasPlaceholders) {
      finalUrl = interpolateUrl(config.url, vars);
    } else {
      const separator = config.url.includes("?") ? "&" : "?";
      finalUrl = `${config.url}${separator}phone=${encodeURIComponent(phone)}&message=${encodeURIComponent(message)}&apiKey=${encodeURIComponent(config.apiKey)}&sender=${encodeURIComponent(config.sender)}`;
    }

    const res = await fetch(finalUrl, { method: "GET" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SMS gateway responded with ${res.status}: ${body}`);
    }
    logger.info({ phone, status: res.status }, "[sms] GET SMS sent");
  } else {
    const resolvedUrl = interpolatePlain(config.url, vars);
    const res = await fetch(resolvedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, apiKey: config.apiKey, sender: config.sender }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SMS gateway responded with ${res.status}: ${body}`);
    }
    logger.info({ phone, status: res.status }, "[sms] POST SMS sent");
  }
}

export async function isSmsGatewayConfigured(): Promise<boolean> {
  const config = await getGatewayConfig();
  return config !== null;
}
