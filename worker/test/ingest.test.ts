import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { DEVICE, MD_DEVICE, MD_SECRET, rawEvent, signedRequest } from "./helpers";

// `exports` nema tipove bez `wrangler types`; dovoljan je Fetcher.
const worker = (exports as unknown as { default: Fetcher }).default;

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row!.n;
}

beforeEach(async () => {
  await env.DB.batch(["raw_events", "raw_event_conflicts", "heartbeats"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});

describe("GET /health", () => {
  it("vraća ok", async () => {
    const res = await worker.fetch("https://gw.test/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "ok" });
  });
});

describe("POST /ingest", () => {
  it("sprema sirovo tijelo bajt za bajt", async () => {
    const body = JSON.stringify(rawEvent(1));
    const res = await worker.fetch(await signedRequest("/ingest", body));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "stored", seq: 1 });

    const row = await env.DB.prepare("SELECT * FROM raw_events WHERE device_id = ? AND seq = 1")
      .bind(DEVICE).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      body, auth_method: "hmac", content_type: "application/json",
      package: "co.infinum.hpb", captured_at: "2026-10-06T14:03:11.402Z",
    });
  });

  it("dedup: isti (device_id, seq) i sadržaj se sprema jednom", async () => {
    const body = JSON.stringify(rawEvent(7));
    const first = await worker.fetch(await signedRequest("/ingest", body));
    const second = await worker.fetch(await signedRequest("/ingest", body));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = await first.json<{ id: number }>();
    expect(await second.json()).toEqual({ status: "duplicate", id: a.id, seq: 7 });
    expect(await count("raw_events")).toBe(1);
    expect(await count("raw_event_conflicts")).toBe(0);
  });

  it("isti seq s drukčijim sadržajem ide u raw_event_conflicts, ništa se ne gubi", async () => {
    await worker.fetch(await signedRequest("/ingest", JSON.stringify(rawEvent(3, "prvi"))));
    const res = await worker.fetch(await signedRequest("/ingest", JSON.stringify(rawEvent(3, "drugi"))));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "seq_conflict_stored", seq: 3 });
    expect(await count("raw_events")).toBe(1);
    expect(await count("raw_event_conflicts")).toBe(1);
  });

  it("isti seq s drugog uređaja nije duplikat", async () => {
    await worker.fetch(await signedRequest("/ingest", JSON.stringify(rawEvent(5))));
    const md = new Request("https://gw.test/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-device-id": MD_DEVICE,
        authorization: `Bearer ${MD_SECRET}`,
      },
      body: "seq=5&package=co.infinum.hpb&title=HPB&text=Priljev+1%2C00+EUR",
    });
    const res = await worker.fetch(md);
    expect(res.status).toBe(201);
    expect(await count("raw_events")).toBe(2);
    const row = await env.DB.prepare("SELECT auth_method, content_type, package FROM raw_events WHERE device_id = ?")
      .bind(MD_DEVICE).first();
    expect(row).toEqual({ auth_method: "token", content_type: "application/x-www-form-urlencoded", package: "co.infinum.hpb" });
  });

  it("odbija nepotpisan zahtjev i ne sprema ništa", async () => {
    const res = await worker.fetch(new Request("https://gw.test/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": DEVICE },
      body: JSON.stringify(rawEvent(9)),
    }));
    expect(res.status).toBe(401);
    expect(await count("raw_events")).toBe(0);
  });

  it("odbija token za uređaj koji mora potpisivati", async () => {
    const res = await worker.fetch(new Request("https://gw.test/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": DEVICE, authorization: "Bearer test-secret-0123456789abcdef" },
      body: JSON.stringify(rawEvent(9)),
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "token_auth_not_allowed" });
  });

  it("odbija device_id u tijelu koji ne odgovara zaglavlju", async () => {
    const body = JSON.stringify({ ...rawEvent(2), device_id: "gw-netko-drugi" });
    const res = await worker.fetch(await signedRequest("/ingest", body));
    expect(res.status).toBe(400);
  });

  it("odbija tijelo bez ispravnog seq", async () => {
    for (const seq of [undefined, -1, 1.5, "abc"]) {
      const body = JSON.stringify({ ...rawEvent(0), seq });
      const res = await worker.fetch(await signedRequest("/ingest", body));
      expect(res.status, `seq=${String(seq)}`).toBe(400);
    }
  });

  it("odbija preveliko tijelo", async () => {
    const body = JSON.stringify(rawEvent(4, "x".repeat(70_000)));
    const res = await worker.fetch(await signedRequest("/ingest", body));
    expect(res.status).toBe(413);
  });
});

describe("POST /heartbeat", () => {
  it("bilježi heartbeat potpisanog uređaja", async () => {
    const res = await worker.fetch(await signedRequest("/heartbeat", JSON.stringify({ battery: 87, queue: 0 })));
    expect(res.status).toBe(200);
    expect(await count("heartbeats")).toBe(1);
  });

  it("odbija nepotpisan heartbeat", async () => {
    const res = await worker.fetch(new Request("https://gw.test/heartbeat", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });
});
