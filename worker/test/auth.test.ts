import { describe, expect, it } from "vitest";
import { authenticate, hmacSha256Hex, parseDeviceSecrets } from "../src/auth";

const secrets = new Map([["gw-01", "s3cret-s3cret-s3cret"]]);
const now = 1_791_295_391;

function headers(h: Record<string, string>) {
  return new Headers(h);
}

describe("hmacSha256Hex", () => {
  it("odgovara RFC 4231 test vektoru 2", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("authenticate (HMAC)", () => {
  const body = '{"seq":1}';
  async function sig(ts: number, b = body, secret = "s3cret-s3cret-s3cret") {
    return hmacSha256Hex(secret, `${ts}.${b}`);
  }

  it("prihvaća ispravan potpis", async () => {
    const r = await authenticate(
      headers({ "x-device-id": "gw-01", "x-timestamp": String(now), "x-signature": await sig(now) }),
      body, secrets, new Set(), now,
    );
    expect(r).toEqual({ ok: true, deviceId: "gw-01", method: "hmac" });
  });

  it("prihvaća potpis velikim slovima", async () => {
    const r = await authenticate(
      headers({ "x-device-id": "gw-01", "x-timestamp": String(now), "x-signature": (await sig(now)).toUpperCase() }),
      body, secrets, new Set(), now,
    );
    expect(r.ok).toBe(true);
  });

  it("odbija izmijenjeno tijelo", async () => {
    const r = await authenticate(
      headers({ "x-device-id": "gw-01", "x-timestamp": String(now), "x-signature": await sig(now) }),
      '{"seq":2}', secrets, new Set(), now,
    );
    expect(r).toMatchObject({ ok: false, error: "bad_signature" });
  });

  it("odbija krivu tajnu", async () => {
    const r = await authenticate(
      headers({ "x-device-id": "gw-01", "x-timestamp": String(now), "x-signature": await sig(now, body, "drugi-kljuc-drugi-kljuc") }),
      body, secrets, new Set(), now,
    );
    expect(r).toMatchObject({ ok: false, error: "bad_signature" });
  });

  it("odbija star timestamp (replay)", async () => {
    const old = now - 301;
    const r = await authenticate(
      headers({ "x-device-id": "gw-01", "x-timestamp": String(old), "x-signature": await sig(old) }),
      body, secrets, new Set(), now,
    );
    expect(r).toMatchObject({ ok: false, error: "stale_timestamp" });
  });

  it("odbija potpis s izmijenjenim timestampom", async () => {
    const r = await authenticate(
      headers({ "x-device-id": "gw-01", "x-timestamp": String(now + 1), "x-signature": await sig(now) }),
      body, secrets, new Set(), now,
    );
    expect(r).toMatchObject({ ok: false, error: "bad_signature" });
  });

  it("odbija nepoznat uređaj i nedostajuće zaglavlje", async () => {
    expect(await authenticate(headers({ "x-device-id": "gw-99" }), body, secrets, new Set(), now))
      .toMatchObject({ ok: false, error: "unknown_device" });
    expect(await authenticate(headers({}), body, secrets, new Set(), now))
      .toMatchObject({ ok: false, error: "missing_device_id" });
    expect(await authenticate(headers({ "x-device-id": "gw-01" }), body, secrets, new Set(), now))
      .toMatchObject({ ok: false, error: "missing_signature" });
  });
});

describe("authenticate (token)", () => {
  it("prihvaća token samo za uređaje s dopuštenjem", async () => {
    const h = headers({ "x-device-id": "gw-01", authorization: "Bearer s3cret-s3cret-s3cret" });
    expect(await authenticate(h, "", secrets, new Set(["gw-01"]), now))
      .toEqual({ ok: true, deviceId: "gw-01", method: "token" });
    expect(await authenticate(h, "", secrets, new Set(), now))
      .toMatchObject({ ok: false, error: "token_auth_not_allowed" });
  });

  it("odbija krivi token", async () => {
    const h = headers({ "x-device-id": "gw-01", authorization: "Bearer s3cret-s3cret-s3creX" });
    expect(await authenticate(h, "", secrets, new Set(["gw-01"]), now))
      .toMatchObject({ ok: false, error: "bad_token" });
  });
});

describe("parseDeviceSecrets", () => {
  it("odbija prekratke tajne i krivi oblik", () => {
    expect(() => parseDeviceSecrets('{"gw-01":"kratko"}')).toThrow();
    expect(() => parseDeviceSecrets('["x"]')).toThrow();
    expect(parseDeviceSecrets(undefined).size).toBe(0);
  });
});
