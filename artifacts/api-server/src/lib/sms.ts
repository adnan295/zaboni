import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";

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

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export async function sendSmsViaGateway(phone: string, message: string): Promise<void> {
  const config = await getGatewayConfig();

  if (!config) {
    if (process.env["NODE_ENV"] !== "production") {
      console.log(`[sms] DEV MODE — SMS to ${phone}: ${message}`);
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
    const resolvedUrl = interpolate(config.url, vars);
    const hasQuery = resolvedUrl.includes("?");
    const needsAppend = !/{phone}|{message}|{apiKey}|{sender}/.test(config.url);
    const finalUrl = needsAppend
      ? `${resolvedUrl}${hasQuery ? "&" : "?"}phone=${encodeURIComponent(phone)}&message=${encodeURIComponent(message)}&apiKey=${encodeURIComponent(config.apiKey)}&sender=${encodeURIComponent(config.sender)}`
      : resolvedUrl;

    const res = await fetch(finalUrl, { method: "GET" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SMS gateway responded with ${res.status}: ${body}`);
    }
    console.log(`[sms] GET SMS sent to ${phone} — status ${res.status}`);
  } else {
    const resolvedUrl = interpolate(config.url, vars);
    const res = await fetch(resolvedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, apiKey: config.apiKey, sender: config.sender }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SMS gateway responded with ${res.status}: ${body}`);
    }
    console.log(`[sms] POST SMS sent to ${phone} — status ${res.status}`);
  }
}

export async function isSmsGatewayConfigured(): Promise<boolean> {
  const config = await getGatewayConfig();
  return config !== null;
}
