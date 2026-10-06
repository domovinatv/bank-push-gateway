import { hmacSha256Hex } from "../src/auth";

export const DEVICE = "gw-test-01";
export const SECRET = "test-secret-0123456789abcdef";
export const MD_DEVICE = "gw-test-md";
export const MD_SECRET = "macrodroid-secret-0123456789";

// Anonimizirani primjer; ne sadrži stvarne podatke.
export function rawEvent(seq: number, text = "Priljev 1,00 EUR") {
  return {
    device_id: DEVICE,
    seq,
    captured_at: "2026-10-06T14:03:11.402Z",
    package: "co.infinum.hpb",
    channel_id: "test-channel",
    notification_key: `0|co.infinum.hpb|${seq}|null|10123`,
    post_time: 1791295391000,
    extras: { "android.title": "HPB", "android.text": text },
  };
}

export async function signedRequest(
  path: string,
  body: string,
  opts: { device?: string; secret?: string; ts?: number; contentType?: string } = {},
): Promise<Request> {
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Hex(opts.secret ?? SECRET, `${ts}.${body}`);
  return new Request(`https://gw.test${path}`, {
    method: "POST",
    headers: {
      "content-type": opts.contentType ?? "application/json",
      "x-device-id": opts.device ?? DEVICE,
      "x-timestamp": ts,
      "x-signature": signature,
    },
    body,
  });
}
