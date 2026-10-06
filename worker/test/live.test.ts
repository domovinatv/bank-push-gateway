import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE } from "../src/admin/session";
import { rawEvent, signedRequest } from "./helpers";

const worker = (exports as unknown as { default: Fetcher }).default;
const BASE = "https://gw.test";

beforeEach(async () => {
  await env.DB.batch(["raw_events", "heartbeats", "admin_sessions"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});

async function cookie(email = "admin@test.hr") {
  return `${SESSION_COOKIE}=${await createSession(env, email, "passkey", "test")}`;
}

function upgrade(headers: Record<string, string>) {
  return worker.fetch(`${BASE}/admin/live`, { headers: { upgrade: "websocket", ...headers } });
}

// Skuplja poruke dok `done` ne vrati true ili istekne vrijeme.
function collect(ws: WebSocket, done: (msgs: Record<string, unknown>[]) => boolean, ms = 3000) {
  const msgs: Record<string, unknown>[] = [];
  return new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout, primljeno: ${JSON.stringify(msgs)}`)), ms);
    ws.addEventListener("message", (m) => {
      msgs.push(JSON.parse(m.data as string));
      if (done(msgs)) { clearTimeout(t); resolve(msgs); }
    });
  });
}

describe("/admin/live", () => {
  it("bez sesije odbija upgrade", async () => {
    const res = await upgrade({ origin: BASE });
    expect(res.status).toBe(401);
    expect(res.webSocket).toBeNull();
  });

  it("odbija tuđi Origin (CSWSH)", async () => {
    const res = await upgrade({ origin: "https://zlo.example", cookie: await cookie() });
    expect(res.status).toBe(403);
  });

  it("šalje novi događaj i heartbeat spojenom adminu, bez sirovog tijela", async () => {
    const res = await upgrade({ origin: BASE, cookie: await cookie() });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const received = collect(ws, (m) => m.some((x) => x.type === "event") && m.some((x) => x.type === "heartbeat"));

    // pričekaj hello da veza sigurno postoji u DO-u prije broadcasta
    await new Promise<void>((r) => ws.addEventListener("message", () => r(), { once: true }));
    expect((await worker.fetch(await signedRequest("/ingest", JSON.stringify(rawEvent(42, "Priljev <b>1,00</b> EUR"))))).status).toBe(201);
    expect((await worker.fetch(await signedRequest("/heartbeat", JSON.stringify({ battery: 77 })))).status).toBe(200);

    const msgs = await received;
    const ev = msgs.find((m) => m.type === "event")!.event as Record<string, unknown>;
    expect(ev).toMatchObject({ seq: 42, device_id: "gw-test-01", package: "co.infinum.hpb", text: "Priljev <b>1,00</b> EUR" });
    expect(ev).not.toHaveProperty("body");
    expect(msgs.find((m) => m.type === "heartbeat")).toMatchObject({ device_id: "gw-test-01", heartbeat: { battery: 77 } });
    ws.close();
  });

  it("duplikat ne šalje novu poruku", async () => {
    const body = JSON.stringify(rawEvent(43));
    await worker.fetch(await signedRequest("/ingest", body));
    const res = await upgrade({ origin: BASE, cookie: await cookie() });
    const ws = res.webSocket!;
    ws.accept();
    await new Promise<void>((r) => ws.addEventListener("message", () => r(), { once: true }));
    const events: unknown[] = [];
    ws.addEventListener("message", (m) => { if (JSON.parse(m.data as string).type === "event") events.push(m.data); });
    expect((await worker.fetch(await signedRequest("/ingest", body))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toHaveLength(0);
    ws.close();
  });
});
