const WAVERIFY_BASE = "https://syriasms.net";
const REQUEST_TIMEOUT_MS = 10_000;

export function isWaVerifyConfigured(): boolean {
  return !!process.env["WAVERIFY_API_KEY"];
}

function getApiKey(): string {
  const key = process.env["WAVERIFY_API_KEY"];
  if (!key) throw new Error("WAVERIFY_API_KEY is not configured");
  return key;
}

function toE164WithPlus(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

function toE164WithoutPlus(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : phone;
}

async function postToWaVerify(
  path: string,
  body: Record<string, string>,
): Promise<Response> {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${WAVERIFY_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestOtp(phone: string): Promise<void> {
  const phoneE164 = toE164WithPlus(phone);

  let res = await postToWaVerify("/api/v1/request_otp", { phone: phoneE164 });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 422) {
      const phoneFallback = toE164WithoutPlus(phone);
      res = await postToWaVerify("/api/v1/request_otp", { phone: phoneFallback });
      if (!res.ok) {
        const body2 = await res.text().catch(() => "");
        throw new Error(`WaVerify request_otp failed (${res.status}): ${body2}`);
      }
      return;
    }
    throw new Error(`WaVerify request_otp failed (${res.status}): ${bodyText}`);
  }
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const phoneE164 = toE164WithPlus(phone);

  let res = await postToWaVerify("/api/v1/verify_otp", { phone: phoneE164, otp });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    if (res.status === 400 || res.status === 422) {
      const phoneFallback = toE164WithoutPlus(phone);
      res = await postToWaVerify("/api/v1/verify_otp", { phone: phoneFallback, otp });
      if (!res.ok) {
        const body2 = await res.text().catch(() => "");
        throw new Error(`WaVerify verify_otp failed (${res.status}): ${body2}`);
      }
    } else {
      throw new Error(`WaVerify verify_otp failed (${res.status}): ${bodyText}`);
    }
  }

  const data = await res.json().catch(() => null);
  return data?.success === true || data?.status === "success" || data?.verified === true;
}

export async function checkHealth(): Promise<{ ok: boolean; status: number | null; message: string }> {
  if (!isWaVerifyConfigured()) {
    return { ok: false, status: null, message: "WAVERIFY_API_KEY not set" };
  }
  try {
    const apiKey = getApiKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${WAVERIFY_BASE}/api/v1/status`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const body = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok ? "WaVerify reachable" : `HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, message: msg };
  }
}
