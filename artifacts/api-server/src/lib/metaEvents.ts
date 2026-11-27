import crypto from "node:crypto";

/**
 * Meta Conversions API: tell Facebook ads about real sign-ups and delivered orders
 * from the server, so campaigns learn who actually orders. Off until both
 * META_PIXEL_ID and META_CAPI_TOKEN are set. Personal data leaves only as SHA-256
 * hashes, the way Meta asks for it.
 */

export type MetaConfig = {
  pixelId: string;
  token: string;
  testCode?: string;
  /** Syrian pounds per US dollar: values go to Meta in USD. */
  sypPerUsd: number;
};

/** What the admin dashboard saves (system_settings "meta_capi"). */
export type StoredMeta = { pixelId?: string; token?: string; testCode?: string; sypPerUsd?: number };

export function parseStoredMeta(raw: unknown): StoredMeta {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return {}; }
  }
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const rate = Number(o.sypPerUsd);
  return {
    pixelId: str(o.pixelId) || undefined,
    token: str(o.token) || undefined,
    testCode: str(o.testCode) || undefined,
    sypPerUsd: Number.isFinite(rate) && rate > 0 ? rate : undefined,
  };
}

export const validPixelId = (s: string) => /^\d{5,20}$/.test(s);
export const validToken = (s: string) => /^[A-Za-z0-9_\-]{20,600}$/.test(s);

/** Server settings (.env) win; the dashboard fills whatever .env leaves empty. Null = off. */
export function metaConfig(env: NodeJS.ProcessEnv = process.env, stored: StoredMeta = {}): MetaConfig | null {
  const pixelId = (env.META_PIXEL_ID ?? "").trim() || stored.pixelId || "";
  const token = (env.META_CAPI_TOKEN ?? "").trim() || stored.token || "";
  if (!validPixelId(pixelId) || token.length < 20) return null;
  const rate = Number(env.META_SYP_PER_USD);
  return {
    pixelId,
    token,
    testCode: (env.META_TEST_EVENT_CODE ?? "").trim() || stored.testCode || undefined,
    sypPerUsd: stored.sypPerUsd ?? (Number.isFinite(rate) && rate > 0 ? rate : 120),
  };
}

/**
 * Checks the token can send to the dataset. A token made in Events Manager may send
 * events without being allowed to read the dataset, so this sends one event marked with
 * a test code: Meta shows it under «Test events» only and never counts it.
 */
export const CHECK_TEST_CODE = "TEST20261";

export async function checkMetaAccess(cfg: MetaConfig, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<number> {
  const r = await sendMetaEvents(
    [{ name: "CompleteRegistration", eventId: `check_${Date.now()}`, time: new Date(), userId: "zaboni_dashboard_check" }],
    { ...cfg, testCode: cfg.testCode || CHECK_TEST_CODE },
    fetchImpl,
  );
  return Number(r?.events_received ?? 0);
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Phone as Meta wants it before hashing: country code + number, digits only. */
export function metaPhone(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^0?9\d{8}$/.test(d)) d = "963" + d.replace(/^0/, "");
  return d;
}

export type MetaEventInput = {
  name: "CompleteRegistration" | "Purchase";
  /** Same id for the same thing, so a repeat is counted once. */
  eventId: string;
  time: Date;
  userId: string;
  phone?: string | null;
  valueSyp?: number | null;
  contentIds?: string[];
  numItems?: number;
};

export function buildMetaEvent(e: MetaEventInput, cfg: MetaConfig) {
  const userData: Record<string, string[]> = { external_id: [sha256(e.userId)] };
  const ph = metaPhone(e.phone);
  if (ph.length >= 8) userData.ph = [sha256(ph)];
  userData.country = [sha256("sy")];

  const customData: Record<string, unknown> = {};
  if (e.name === "Purchase") {
    const syp = Math.max(0, Number(e.valueSyp) || 0);
    customData.currency = "USD";
    customData.value = Math.round((syp / cfg.sypPerUsd) * 100) / 100;
    if (e.contentIds?.length) {
      customData.content_ids = e.contentIds;
      customData.content_type = "product";
    }
    if (e.numItems) customData.num_items = e.numItems;
  }

  return {
    event_name: e.name,
    event_time: Math.floor(e.time.getTime() / 1000),
    event_id: e.eventId,
    action_source: "system_generated",
    user_data: userData,
    ...(Object.keys(customData).length ? { custom_data: customData } : {}),
  };
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export async function sendMetaEvents(
  events: MetaEventInput[],
  cfg: MetaConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ events_received?: number } | null> {
  if (!events.length) return null;
  const body: Record<string, unknown> = { data: events.map((e) => buildMetaEvent(e, cfg)) };
  if (cfg.testCode) body.test_event_code = cfg.testCode;
  const url = `https://graph.facebook.com/v21.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`;
  const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* keep raw */ }
    throw new Error(`meta_capi_${res.status}: ${msg}`);
  }
  try { return JSON.parse(text); } catch { return null; }
}
