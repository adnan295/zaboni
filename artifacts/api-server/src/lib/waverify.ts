const WAVERIFY_BASE = "https://syriasms.net";

export function isWaVerifyConfigured(): boolean {
  return !!process.env["WAVERIFY_API_KEY"];
}

function getApiKey(): string {
  const key = process.env["WAVERIFY_API_KEY"];
  if (!key) throw new Error("WAVERIFY_API_KEY is not configured");
  return key;
}

function normalizePhone(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : phone;
}

export async function requestOtp(phone: string): Promise<void> {
  const apiKey = getApiKey();
  const normalizedPhone = normalizePhone(phone);

  const res = await fetch(`${WAVERIFY_BASE}/api/v1/request_otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ phone: normalizedPhone }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WaVerify request_otp failed (${res.status}): ${body}`);
  }
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const apiKey = getApiKey();
  const normalizedPhone = normalizePhone(phone);

  const res = await fetch(`${WAVERIFY_BASE}/api/v1/verify_otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ phone: normalizedPhone, otp }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WaVerify verify_otp failed (${res.status}): ${body}`);
  }

  const data = await res.json().catch(() => null);
  return data?.success === true || data?.status === "success" || data?.verified === true;
}
