// Admin stranice. Hono JSX escapea svaki {izraz}; tekst obavijesti (ime
// uplatitelja, opis plaćanja) piše bilo tko tko uplati novac, pa se nigdje
// ne koristi raw() osim za konstantni logo.

import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type ConflictRow, type DeviceStatus, type EventPage as EventPageData, type EventSummary, type PasskeyInfo } from "./db";
import type { Session } from "./session";
import { LOGO_SVG } from "./static";

const fmt = new Intl.DateTimeFormat("hr-HR", {
  timeZone: "Europe/Zagreb",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

export function time(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmt.format(d);
}

function latency(ms: number | null): string {
  if (ms === null) return "—";
  return Math.abs(ms) < 10_000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms / 1000)} s`;
}

function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "nikad";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 90) return `prije ${s} s`;
  if (s < 5400) return `prije ${Math.round(s / 60)} min`;
  if (s < 172800) return `prije ${Math.round(s / 3600)} h`;
  return `prije ${Math.round(s / 86400)} d`;
}

type Tab = "events" | "devices" | "conflicts" | "passkeys";

function Layout(props: { title: string; session?: Session; tab?: Tab; refresh?: number; children: Child }) {
  const nav: [Tab, string, string][] = [
    ["events", "/admin", "Događaji"],
    ["devices", "/admin/devices", "Uređaji"],
    ["conflicts", "/admin/conflicts", "Konflikti"],
    ["passkeys", "/admin/passkeys", "Passkeyi"],
  ];
  return (
    <>
    {raw("<!DOCTYPE html>")}
    <html lang="hr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        {props.refresh ? <meta http-equiv="refresh" content={String(props.refresh)} /> : null}
        <title>{props.title} · Bank Push Gateway</title>
        <link rel="stylesheet" href="/admin/static/admin.css" />
      </head>
      <body>
        <div class="tricolor"><span class="red" /><span class="white" /><span class="navy" /></div>
        <header>
          <a class="brand" href="/admin">
            {raw(LOGO_SVG)}
            <span class="word">DOMOVINA<span class="accent">.</span> bank push</span>
          </a>
          {props.session ? (
            <>
              <nav>
                {nav.map(([key, href, label]) => (
                  <a href={href} class={props.tab === key ? "active" : ""}>{label}</a>
                ))}
              </nav>
              <div class="who">
                <span id="live-status" class="live off" title="Live veza">○ spajanje…</span>
                <span>{props.session.email} · {props.session.method}</span>
                <form method="post" action="/admin/logout">
                  <button class="secondary" type="submit">Odjava</button>
                </form>
              </div>
            </>
          ) : null}
        </header>
        <main>{props.children}</main>
        <script src="/admin/static/passkey.js" defer />
        {props.session ? <script src="/admin/static/live.js" defer /> : null}
      </body>
    </html>
    </>
  );
}

export function LoginPage(props: { next: string; error?: string; accessConfigured: boolean }) {
  return (
    <Layout title="Prijava">
      <div class="login">
        <h1>Prijava</h1>
        {props.error ? <div class="msg bad">{props.error}</div> : null}
        <div id="msg" class="msg" hidden />
        <button id="passkey-login" type="button" data-next={props.next}>Prijava passkeyem</button>
        {props.accessConfigured ? (
          <a class="button secondary" href={`/admin/sso?next=${encodeURIComponent(props.next)}`}>
            Prijava preko Cloudflare Accessa
          </a>
        ) : (
          <p class="muted small">Cloudflare Access nije konfiguriran.</p>
        )}
        <p class="muted small">
          Prvi passkey se upisuje nakon prijave preko Accessa (Passkeyi → Dodaj).
        </p>
      </div>
    </Layout>
  );
}

export function EventsPage(props: {
  session: Session;
  result: EventPageData;
  devices: string[];
  packages: string[];
  device?: string;
  pkg?: string;
}) {
  const { events, total, page, pages, perPage } = props.result;
  const firstPage = page === 1;
  const q = (toPage: number) => {
    const p = new URLSearchParams();
    if (props.device) p.set("device", props.device);
    if (props.pkg) p.set("package", props.pkg);
    if (perPage !== DEFAULT_PAGE_SIZE) p.set("per", String(perPage));
    if (toPage > 1) p.set("page", String(toPage));
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  // Najviše 7 brojeva oko trenutne stranice.
  const start = Math.max(1, Math.min(page - 3, pages - 6));
  const numbers = Array.from({ length: Math.min(7, pages) }, (_, i) => start + i);
  const Pager = () => (
    <nav class="pager" aria-label="Stranice">
      <span class="muted small">{from}–{to} od <span class="events-total">{total}</span></span>
      {pages > 1 ? (
        <>
          {page > 1 ? <a class="button secondary" href={q(1)}>« Prva</a> : <span class="button secondary disabled">« Prva</span>}
          {page > 1 ? <a class="button secondary" href={q(page - 1)}>‹ Novije</a> : <span class="button secondary disabled">‹ Novije</span>}
          {numbers.map((n) =>
            n === page ? <span class="button current" aria-current="page">{n}</span> : <a class="button secondary" href={q(n)}>{n}</a>,
          )}
          {page < pages ? <a class="button secondary" href={q(page + 1)}>Starije ›</a> : <span class="button secondary disabled">Starije ›</span>}
          {page < pages ? <a class="button secondary" href={q(pages)}>Zadnja »</a> : <span class="button secondary disabled">Zadnja »</span>}
        </>
      ) : null}
    </nav>
  );
  return (
    <Layout title="Događaji" session={props.session} tab="events">
      <h1>Sirovi događaji</h1>
      <p class="muted small">Novi događaji pojavljuju se odmah (WebSocket){firstPage ? "" : " — samo na prvoj stranici"}.</p>
      <form class="filters" method="get" action="/admin">
        <label>Uređaj
          <select name="device">
            <option value="">svi</option>
            {props.devices.map((d) => <option value={d} selected={d === props.device}>{d}</option>)}
          </select>
        </label>
        <label>Paket
          <select name="package">
            <option value="">svi</option>
            {props.packages.map((p) => <option value={p} selected={p === props.pkg}>{p}</option>)}
          </select>
        </label>
        <label>Po stranici
          <select name="per">
            {PAGE_SIZES.map((n) => <option value={String(n)} selected={n === perPage}>{n}</option>)}
          </select>
        </label>
        <button type="submit">Primijeni</button>
      </form>
      <Pager />
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Primljeno</th><th>Uređaj</th><th>Paket</th>
              <th>Naslov</th><th>Tekst</th><th title="received_at − captured_at">Kašnjenje</th>
            </tr>
          </thead>
          <tbody
            id="events-body"
            data-live={firstPage ? "1" : "0"}
            data-device={props.device ?? ""}
            data-package={props.pkg ?? ""}
          >
            {events.length === 0 ? (
              <tr id="events-empty"><td colspan={7} class="muted">Nema događaja.</td></tr>
            ) : (
              events.map((e) => (
                <tr>
                  <td class="nowrap"><a href={`/admin/events/${e.id}`}>{e.id}</a></td>
                  <td class="nowrap">{time(e.received_at)}</td>
                  <td class="nowrap">{e.device_id}</td>
                  <td class="nowrap"><code>{e.package ?? "—"}</code></td>
                  <td>{e.title ?? "—"}</td>
                  <td class="text">{e.text ?? <span class="muted">—</span>}</td>
                  <td class="nowrap">{latency(e.latencyMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager />
    </Layout>
  );
}

export function EventPage(props: { session: Session; event: EventSummary }) {
  const e = props.event;
  let pretty = e.body;
  if (e.content_type === "application/json") {
    try { pretty = JSON.stringify(JSON.parse(e.body), null, 2); } catch { /* prikaži sirovo */ }
  } else if (e.content_type === "application/x-www-form-urlencoded") {
    pretty = JSON.stringify(Object.fromEntries(new URLSearchParams(e.body)), null, 2);
  }
  return (
    <Layout title={`Događaj ${e.id}`} session={props.session} tab="events">
      <p><a href="/admin">← svi događaji</a></p>
      <h1>Događaj #{e.id}</h1>
      <dl>
        <dt>Uređaj</dt><dd>{e.device_id}</dd>
        <dt>seq</dt><dd><code>{e.seq}</code></dd>
        <dt>Paket</dt><dd><code>{e.package ?? "—"}</code></dd>
        <dt>Uhvaćeno (telefon)</dt><dd>{time(e.captured_at)}</dd>
        <dt>Primljeno (Worker)</dt><dd>{time(e.received_at)}</dd>
        <dt>Kašnjenje</dt><dd>{latency(e.latencyMs)}</dd>
        <dt>Auth</dt><dd>{e.auth_method}</dd>
        <dt>Content-Type</dt><dd><code>{e.content_type}</code></dd>
        <dt>SHA-256 tijela</dt><dd><code>{e.body_sha256}</code></dd>
      </dl>
      <h2>Sirovo tijelo</h2>
      <pre>{pretty}</pre>
    </Layout>
  );
}

export function DevicesPage(props: { session: Session; devices: DeviceStatus[]; staleMinutes: number }) {
  return (
    <Layout title="Uređaji" session={props.session} tab="devices">
      <h1>Uređaji</h1>
      <p class="muted small">Heartbeat stariji od {props.staleMinutes} min označen je crveno. Stranica se osvježava na svaki heartbeat i događaj (WebSocket).</p>
      <div class="cards" id="devices" data-live-reload="1">
        {props.devices.map((d) => {
          const hb = d.heartbeat ?? {};
          return (
            <div class="card">
              <h3>
                <span>{d.deviceId}</span>
                <span class={`badge ${d.stale ? "bad" : "ok"}`}>{d.stale ? "nema heartbeata" : "živ"}</span>
              </h3>
              <dl>
                <dt>Heartbeat</dt><dd>{ago(d.lastHeartbeatAt)} <span class="muted small">({time(d.lastHeartbeatAt)})</span></dd>
                <dt>Listener</dt><dd>{hb.listener_connected === true ? "spojen" : hb.listener_connected === false ? "NIJE spojen" : "—"}</dd>
                <dt>Baterija</dt><dd>{typeof hb.battery === "number" ? `${hb.battery} %${hb.charging ? " (puni se)" : ""}` : "—"}</dd>
                <dt>Red na telefonu</dt><dd>{typeof hb.queue_pending === "number" ? `${hb.queue_pending} čeka, ${String(hb.queue_failed ?? 0)} odbijeno` : "—"}</dd>
                <dt>Aplikacija</dt><dd>{typeof hb.app_version === "string" ? hb.app_version : "—"}</dd>
                <dt>Zadnji događaj</dt><dd>{ago(d.lastEventAt)}</dd>
                <dt>Događaja 24 h</dt><dd>{d.events24h}</dd>
                <dt>Tajna</dt><dd>{d.configured ? "postoji" : <span class="bad">nije u DEVICE_SECRETS</span>}</dd>
              </dl>
              <p class="small"><a href={`/admin?device=${encodeURIComponent(d.deviceId)}`}>Događaji uređaja →</a></p>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

export function ConflictsPage(props: { session: Session; conflicts: ConflictRow[] }) {
  return (
    <Layout title="Konflikti" session={props.session} tab="conflicts">
      <h1>Konflikti seq</h1>
      <p class="muted small">Isti (uređaj, seq) s drukčijim sadržajem — npr. resetiran brojač. Ništa nije izgubljeno.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Primljeno</th><th>Uređaj</th><th>seq</th><th>Tijelo</th></tr></thead>
          <tbody>
            {props.conflicts.length === 0 ? (
              <tr><td colspan={5} class="muted">Nema konflikata.</td></tr>
            ) : (
              props.conflicts.map((c) => (
                <tr>
                  <td>{c.id}</td>
                  <td class="nowrap">{time(c.received_at)}</td>
                  <td>{c.device_id}</td>
                  <td><code>{c.seq}</code></td>
                  <td class="text"><code>{c.body}</code></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

export function PasskeysPage(props: { session: Session; passkeys: PasskeyInfo[] }) {
  return (
    <Layout title="Passkeyi" session={props.session} tab="passkeys">
      <h1>Passkeyi za {props.session.email}</h1>
      <div id="msg" class="msg" hidden />
      <div class="table-wrap">
        <table>
          <thead><tr><th>Oznaka</th><th>Upisan</th><th>Zadnja uporaba</th><th /></tr></thead>
          <tbody>
            {props.passkeys.length === 0 ? (
              <tr><td colspan={4} class="muted">Još nema passkeya. Dodaj prvi ispod.</td></tr>
            ) : (
              props.passkeys.map((p) => (
                <tr>
                  <td>{p.label}</td>
                  <td class="nowrap">{time(p.created_at)}</td>
                  <td class="nowrap">{time(p.last_used_at)}</td>
                  <td>
                    <form method="post" action={`/admin/passkeys/${encodeURIComponent(p.id)}/delete`}>
                      <button class="danger" type="submit">Ukloni</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <h2>Dodaj passkey</h2>
      <form id="passkey-register" class="filters">
        <label>Oznaka uređaja
          <input type="text" name="label" placeholder="npr. Mac Mini / Apple Passwords" maxlength={80} required />
        </label>
        <button type="submit">Dodaj passkey</button>
      </form>
      <p class="muted small">
        Passkey vrijedi samo za ovu domenu. Access ostaje drugi put ulaska i služi za oporavak
        ako izgubiš sve passkeye.
      </p>
    </Layout>
  );
}
