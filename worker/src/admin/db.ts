// Upiti za admin prikaz. Samo čitanje.

import type { Env } from "../env";
import { parseDeviceSecrets } from "../auth";

export const STALE_HEARTBEAT_MINUTES = 15;

export interface EventRow {
  id: number;
  device_id: string;
  seq: number;
  received_at: string;
  captured_at: string | null;
  package: string | null;
  auth_method: string;
  content_type: string;
  body: string;
  body_sha256: string;
}

export interface EventSummary extends EventRow {
  title: string | null;
  text: string | null;
  latencyMs: number | null;
}

// Za prikaz izvlači naslov i tekst iz sirovog tijela. Ne tumači sadržaj banke.
export function summarize(row: EventRow): EventSummary {
  let title: unknown = null;
  let text: unknown = null;
  try {
    if (row.content_type === "application/json") {
      const extras = (JSON.parse(row.body) as { extras?: Record<string, unknown> }).extras ?? {};
      title = extras["android.title"];
      text = extras["android.bigText"] ?? extras["android.text"];
    } else {
      const form = new URLSearchParams(row.body);
      title = form.get("title");
      text = form.get("big_text") || form.get("text");
    }
  } catch {
    /* neispravan JSON: prikaži bez sažetka */
  }
  const captured = row.captured_at ? Date.parse(row.captured_at) : NaN;
  return {
    ...row,
    title: typeof title === "string" ? title : null,
    text: typeof text === "string" ? text : null,
    latencyMs: Number.isFinite(captured) ? Date.parse(row.received_at) - captured : null,
  };
}

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

export interface EventPage {
  events: EventSummary[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

/** Stranica je 1-based; prevelika stranica se svodi na zadnju. */
export async function listEvents(
  env: Env,
  f: { device?: string; pkg?: string; page?: number; perPage?: number },
): Promise<EventPage> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.device) { where.push("device_id = ?"); binds.push(f.device); }
  if (f.pkg) { where.push("package = ?"); binds.push(f.pkg); }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const perPage = (PAGE_SIZES as readonly number[]).includes(f.perPage ?? 0) ? f.perPage! : DEFAULT_PAGE_SIZE;

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM raw_events ${whereSql}`)
    .bind(...binds).first<{ n: number }>();
  const total = countRow?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1)), pages);

  const rows = await env.DB.prepare(
    `SELECT * FROM raw_events ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, perPage, (page - 1) * perPage).all<EventRow>();
  return { events: rows.results.map(summarize), total, page, pages, perPage };
}

export async function getEvent(env: Env, id: number): Promise<EventSummary | null> {
  const row = await env.DB.prepare("SELECT * FROM raw_events WHERE id = ?").bind(id).first<EventRow>();
  return row ? summarize(row) : null;
}

export async function filterValues(env: Env): Promise<{ devices: string[]; packages: string[] }> {
  const [d, p] = await env.DB.batch<{ v: string }>([
    env.DB.prepare("SELECT DISTINCT device_id AS v FROM raw_events ORDER BY v"),
    env.DB.prepare("SELECT DISTINCT package AS v FROM raw_events WHERE package IS NOT NULL ORDER BY v"),
  ]);
  return { devices: d.results.map((r) => r.v), packages: p.results.map((r) => r.v) };
}

export interface DeviceStatus {
  deviceId: string;
  configured: boolean;
  lastHeartbeatAt: string | null;
  heartbeat: Record<string, unknown> | null;
  lastEventAt: string | null;
  events24h: number;
  stale: boolean;
}

export async function deviceStatuses(env: Env, now = Date.now()): Promise<DeviceStatus[]> {
  let configured: string[] = [];
  try {
    configured = [...parseDeviceSecrets(env.DEVICE_SECRETS).keys()];
  } catch {
    /* prikaži barem viđene uređaje */
  }
  const since = new Date(now - 24 * 3600 * 1000).toISOString();
  const [hb, ev] = await env.DB.batch([
    env.DB.prepare(
      `SELECT h.device_id, h.received_at, h.body FROM heartbeats h
       JOIN (SELECT device_id, MAX(id) AS id FROM heartbeats GROUP BY device_id) m ON m.id = h.id`,
    ),
    env.DB.prepare(
      `SELECT device_id, MAX(received_at) AS last_at, SUM(received_at >= ?) AS n24
       FROM raw_events GROUP BY device_id`,
    ).bind(since),
  ]);
  const hbBy = new Map((hb.results as { device_id: string; received_at: string; body: string }[]).map((r) => [r.device_id, r]));
  const evBy = new Map((ev.results as { device_id: string; last_at: string; n24: number }[]).map((r) => [r.device_id, r]));
  const ids = [...new Set([...configured, ...hbBy.keys(), ...evBy.keys()])].sort();
  return ids.map((deviceId) => {
    const h = hbBy.get(deviceId);
    let heartbeat: Record<string, unknown> | null = null;
    try {
      heartbeat = h ? (JSON.parse(h.body) as Record<string, unknown>) : null;
    } catch {
      heartbeat = null;
    }
    const lastHb = h?.received_at ?? null;
    return {
      deviceId,
      configured: configured.includes(deviceId),
      lastHeartbeatAt: lastHb,
      heartbeat,
      lastEventAt: evBy.get(deviceId)?.last_at ?? null,
      events24h: evBy.get(deviceId)?.n24 ?? 0,
      stale: !lastHb || now - Date.parse(lastHb) > STALE_HEARTBEAT_MINUTES * 60 * 1000,
    };
  });
}

export interface ConflictRow {
  id: number;
  device_id: string;
  seq: number;
  received_at: string;
  body: string;
}

export async function listConflicts(env: Env): Promise<ConflictRow[]> {
  const r = await env.DB.prepare(
    "SELECT id, device_id, seq, received_at, body FROM raw_event_conflicts ORDER BY id DESC LIMIT 200",
  ).all<ConflictRow>();
  return r.results;
}

export interface PasskeyInfo {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export async function listPasskeys(env: Env, email: string): Promise<PasskeyInfo[]> {
  const r = await env.DB.prepare(
    "SELECT id, label, created_at, last_used_at FROM admin_passkeys WHERE email = ? ORDER BY created_at",
  ).bind(email).all<PasskeyInfo>();
  return r.results;
}
