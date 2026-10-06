// Faza 0: samo bilježi. Worker ne parsira tekst obavijesti banke.

import { authenticate, parseDeviceSecrets, sha256Hex, type AuthMethod } from "./auth";

export interface Env {
  DB: D1Database;
  DEVICE_SECRETS?: string;
  TOKEN_AUTH_DEVICES?: string;
}

const MAX_BODY_BYTES = 64 * 1024;

type Envelope = Record<string, unknown>;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    try {
      switch (route) {
        case "GET /health":
          return await health(env);
        case "POST /ingest":
          return await withAuth(request, env, ingest);
        case "POST /heartbeat":
          return await withAuth(request, env, heartbeat);
        default:
          return json({ error: "not_found" }, 404);
      }
    } catch (err) {
      console.error(JSON.stringify({ msg: "unhandled", route, err: String(err) }));
      return json({ error: "internal" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

type AuthedHandler = (ctx: {
  env: Env;
  deviceId: string;
  method: AuthMethod;
  contentType: string;
  body: string;
  envelope: Envelope;
}) => Promise<Response>;

async function withAuth(request: Request, env: Env, handler: AuthedHandler): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: "body_too_large" }, 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return json({ error: "body_too_large" }, 413);
  }

  let secrets: Map<string, string>;
  try {
    secrets = parseDeviceSecrets(env.DEVICE_SECRETS);
  } catch (err) {
    console.error(JSON.stringify({ msg: "bad DEVICE_SECRETS", err: String(err) }));
    return json({ error: "server_misconfigured" }, 500);
  }
  const tokenDevices = new Set(
    (env.TOKEN_AUTH_DEVICES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );

  const auth = await authenticate(request.headers, body, secrets, tokenDevices, Math.floor(Date.now() / 1000));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const envelope = parseEnvelope(contentType, body);
  if (!envelope) return json({ error: "bad_body", expected: "application/json object or form-urlencoded" }, 400);

  if (envelope.device_id !== undefined && envelope.device_id !== auth.deviceId) {
    return json({ error: "device_id_mismatch" }, 400);
  }

  return handler({ env, deviceId: auth.deviceId, method: auth.method, contentType, body, envelope });
}

// Čita samo omotnicu (seq, package, captured_at). Sadržaj obavijesti ostaje sirov u `body`.
function parseEnvelope(contentType: string, body: string): Envelope | null {
  if (contentType === "application/json") {
    try {
      const parsed: unknown = JSON.parse(body);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Envelope) : null;
    } catch {
      return null;
    }
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return Object.fromEntries(new URLSearchParams(body));
  }
  return null;
}

function parseSeq(value: unknown): number | null {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function optString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 256) : null;
}

const ingest: AuthedHandler = async ({ env, deviceId, method, contentType, body, envelope }) => {
  const seq = parseSeq(envelope.seq);
  if (seq === null) return json({ error: "bad_seq", expected: "non-negative integer" }, 400);

  const receivedAt = new Date().toISOString();
  const bodySha = await sha256Hex(body);

  const inserted = await env.DB.prepare(
    `INSERT INTO raw_events
       (device_id, seq, received_at, auth_method, content_type, body, body_sha256, package, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (device_id, seq) DO NOTHING
     RETURNING id`,
  )
    .bind(deviceId, seq, receivedAt, method, contentType, body, bodySha,
      optString(envelope.package), optString(envelope.captured_at))
    .first<{ id: number }>();

  if (inserted) return json({ status: "stored", id: inserted.id, seq }, 201);

  const existing = await env.DB.prepare(
    "SELECT id, body_sha256 FROM raw_events WHERE device_id = ? AND seq = ?",
  )
    .bind(deviceId, seq)
    .first<{ id: number; body_sha256: string }>();

  if (existing?.body_sha256 === bodySha) {
    // Ponovljeni pokušaj s telefona: potvrdi da ga prestane slati.
    return json({ status: "duplicate", id: existing.id, seq }, 200);
  }

  // Isti seq, drukčiji sadržaj. Spremi zasebno, ne gubi ništa.
  const conflict = await env.DB.prepare(
    `INSERT INTO raw_event_conflicts
       (device_id, seq, received_at, auth_method, content_type, body, body_sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(deviceId, seq, receivedAt, method, contentType, body, bodySha)
    .first<{ id: number }>();
  console.warn(JSON.stringify({ msg: "seq_conflict", deviceId, seq, conflictId: conflict?.id }));
  return json({ status: "seq_conflict_stored", conflict_id: conflict?.id, seq }, 200);
};

const heartbeat: AuthedHandler = async ({ env, deviceId, body }) => {
  const receivedAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO heartbeats (device_id, received_at, body) VALUES (?, ?, ?)")
    .bind(deviceId, receivedAt, body)
    .run();
  return json({ status: "ok", received_at: receivedAt }, 200);
};

async function health(env: Env): Promise<Response> {
  try {
    await env.DB.prepare("SELECT 1").first();
    return json({ ok: true, db: "ok" }, 200);
  } catch {
    return json({ ok: false, db: "error" }, 503);
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
