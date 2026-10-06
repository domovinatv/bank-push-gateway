// Autentikacija uređaja.
//
// HMAC (zadano):
//   X-Device-Id: gw-01
//   X-Timestamp: <unix sekunde>
//   X-Signature: hex(HMAC-SHA256(tajna, "<timestamp>.<tijelo>"))
//
// Token (samo za uređaje u TOKEN_AUTH_DEVICES, npr. MacroDroid):
//   X-Device-Id: gw-01
//   Authorization: Bearer <tajna>

export const MAX_CLOCK_SKEW_SECONDS = 300;

export type AuthMethod = "hmac" | "token";

export type AuthResult =
  | { ok: true; deviceId: string; method: AuthMethod }
  | { ok: false; status: 401 | 500; error: string };

const encoder = new TextEncoder();

export function parseDeviceSecrets(raw: string | undefined): Map<string, string> {
  if (!raw) return new Map();
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("DEVICE_SECRETS mora biti JSON objekt {device_id: tajna}");
  }
  const secrets = new Map<string, string>();
  for (const [deviceId, secret] of Object.entries(parsed)) {
    if (typeof secret !== "string" || secret.length < 16) {
      throw new Error(`DEVICE_SECRETS: tajna za ${deviceId} mora imati barem 16 znakova`);
    }
    secrets.set(deviceId, secret);
  }
  return secrets;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

export async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(message)));
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Usporedba u konstantnom vremenu (preko SHA-256 da duljine budu jednake).
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb) && a.length === b.length;
}

export async function authenticate(
  headers: Headers,
  body: string,
  secrets: Map<string, string>,
  tokenDevices: Set<string>,
  nowSeconds: number,
): Promise<AuthResult> {
  const deviceId = headers.get("x-device-id");
  if (!deviceId) return { ok: false, status: 401, error: "missing_device_id" };
  const secret = secrets.get(deviceId);
  if (!secret) return { ok: false, status: 401, error: "unknown_device" };

  const signature = headers.get("x-signature");
  if (signature) {
    const ts = headers.get("x-timestamp");
    if (!ts || !/^\d{1,12}$/.test(ts)) return { ok: false, status: 401, error: "bad_timestamp" };
    if (Math.abs(nowSeconds - Number(ts)) > MAX_CLOCK_SKEW_SECONDS) {
      return { ok: false, status: 401, error: "stale_timestamp" };
    }
    const expected = await hmacSha256Hex(secret, `${ts}.${body}`);
    if (!(await timingSafeEqual(signature.toLowerCase(), expected))) {
      return { ok: false, status: 401, error: "bad_signature" };
    }
    return { ok: true, deviceId, method: "hmac" };
  }

  const authz = headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    if (!tokenDevices.has(deviceId)) return { ok: false, status: 401, error: "token_auth_not_allowed" };
    if (!(await timingSafeEqual(authz.slice(7), secret))) {
      return { ok: false, status: 401, error: "bad_token" };
    }
    return { ok: true, deviceId, method: "token" };
  }

  return { ok: false, status: 401, error: "missing_signature" };
}
