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

export function metaConfig(env: NodeJS.ProcessEnv = process.env): MetaConfig | null {
  const pixelId = (env.META_PIXEL_ID ?? "").trim();
  const token = (env.META_CAPI_TOKEN ?? "").trim();
  if (!/^\d{5,20}$/.test(pixelId) || token.length < 20) return null;
  const rate = Number(env.META_SYP_PER_USD);
  return {
    pixelId,
    token,
    testCode: (env.META_TEST_EVENT_CODE ?? "").trim() || undefined,
    sypPerUsd: Number.isFinite(rate) && rate > 0 ? rate : 120,
  };
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
): Promise<void> {
  if (!events.length) return;
  const body: Record<string, unknown> = { data: events.map((e) => buildMetaEvent(e, cfg)) };
  if (cfg.testCode) body.test_event_code = cfg.testCode;
  const url = `https://graph.facebook.com/v21.0/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.token)}`;
  const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`meta_capi_${res.status}: ${(await res.text()).slice(0, 300)}`);
}
