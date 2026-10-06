// /admin: pregled sirovih događaja, uređaja i konflikata.
//
// Dva puta ulaska, jedna sesija:
//   1. passkey (WebAuthn), ključ u Apple Passwords i sl.
//   2. Cloudflare Access na /admin/sso (Worker dodatno provjerava JWT)
// Prvi passkey se upisuje nakon ulaska preko Accessa.

import { Hono, type Context } from "hono";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { adminEmails, type Env } from "../env";
import { verifyAccessJwt } from "./access";
import {
  deviceStatuses,
  filterValues,
  getEvent,
  listConflicts,
  listEvents,
  listPasskeys,
  PAGE_SIZE,
  STALE_HEARTBEAT_MINUTES,
} from "./db";
import { loginOptions, registrationOptions, verifyLogin, verifyRegistration } from "./passkey";
import {
  createSession,
  deleteSession,
  getSession,
  readCookie,
  safeNext,
  SESSION_TTL_SECONDS,
  sessionCookie,
  type Session,
} from "./session";
import { liveFeed } from "../live";
import { ADMIN_CSS, LIVE_JS, PASSKEY_JS } from "./static";
import {
  ConflictsPage,
  DevicesPage,
  EventPage,
  EventsPage,
  LoginPage,
  PasskeysPage,
} from "./views";

type AppEnv = { Bindings: Env; Variables: { session: Session } };
type Ctx = Context<AppEnv>;

export const admin = new Hono<AppEnv>();

const PUBLIC_PATHS = new Set([
  "/admin/login",
  "/admin/sso",
  "/admin/passkey/login/options",
  "/admin/passkey/login/verify",
  "/admin/static/admin.css",
  "/admin/static/passkey.js",
  "/admin/static/live.js",
]);

// Sigurnosna zaglavlja na svemu pod /admin.
admin.use("*", async (c, next) => {
  await next();
  if (c.res.status === 101) return;
  const h = c.res.headers;
  h.set(
    "content-security-policy",
    `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' wss://${new URL(c.req.url).host}; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  );
  h.set("x-content-type-options", "nosniff");
  // Ne "no-referrer": uz nju preglednik na POST iz <form> šalje `Origin: null`
  // i CSRF provjera ispod odbije vlastitu odjavu. "same-origin" i dalje ne
  // šalje ništa izvan domene.
  h.set("referrer-policy", "same-origin");
  h.set("x-frame-options", "DENY");
  if (!h.has("cache-control")) h.set("cache-control", "no-store");
});

// CSRF: svaki POST mora doći s istog origina (kolačić je SameSite=Lax).
admin.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if (!origin || origin !== new URL(c.req.url).origin) return c.json({ error: "bad_origin" }, 403);
  }
  await next();
});

// Auth: sve osim javnih putanja traži sesiju.
admin.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PATHS.has(path)) return next();
  const session = await getSession(c.env, c.req.header("cookie") ?? null);
  if (!session) {
    if (c.req.method !== "GET" || c.req.header("upgrade")) return c.json({ error: "unauthorized" }, 401);
    const next = path + new URL(c.req.url).search;
    return c.redirect(`/admin/login?next=${encodeURIComponent(next)}`, 302);
  }
  c.set("session", session);
  await next();
});

admin.get("/admin/static/admin.css", (c) =>
  c.body(ADMIN_CSS, 200, { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" }),
);
admin.get("/admin/static/live.js", (c) =>
  c.body(LIVE_JS, 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" }),
);
admin.get("/admin/static/passkey.js", (c) =>
  c.body(PASSKEY_JS, 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" }),
);

const accessConfigured = (env: Env) => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

admin.get("/admin/login", async (c) => {
  const next = safeNext(c.req.query("next"));
  if (await getSession(c.env, c.req.header("cookie") ?? null)) return c.redirect(next, 302);
  const error = c.req.query("error") === "access" ? "Access prijava nije prihvaćena za ovaj admin." : undefined;
  return c.html(<LoginPage next={next} error={error} accessConfigured={accessConfigured(c.env)} />);
});

// Access na rubu štiti samo ovu putanju. Ovdje se JWT pretvara u našu sesiju.
admin.get("/admin/sso", async (c) => {
  if (!accessConfigured(c.env)) return c.text("Cloudflare Access nije konfiguriran.", 503);
  const token = c.req.header("cf-access-jwt-assertion") ?? readCookie(c.req.header("cookie") ?? null, "CF_Authorization");
  const claims = token
    ? await verifyAccessJwt(token, { teamDomain: c.env.ACCESS_TEAM_DOMAIN!, aud: c.env.ACCESS_AUD! })
    : null;
  if (!claims || !adminEmails(c.env).has(claims.email)) {
    console.warn(JSON.stringify({ msg: "access_login_rejected", email: claims?.email ?? null }));
    return c.redirect("/admin/login?error=access", 302);
  }
  return startSession(c, claims.email, "access", safeNext(c.req.query("next")));
});

async function startSession(c: Ctx, email: string, method: "passkey" | "access", next: string, asJson = false) {
  const token = await createSession(c.env, email, method, c.req.header("user-agent") ?? null);
  c.header("set-cookie", sessionCookie(token, SESSION_TTL_SECONDS));
  return asJson ? c.json({ ok: true, next }) : c.redirect(next, 302);
}

admin.post("/admin/passkey/login/options", async (c) => c.json(await loginOptions(c.env, new URL(c.req.url))));

admin.post("/admin/passkey/login/verify", async (c) => {
  const body = await c.req.json<{ response?: AuthenticationResponseJSON; next?: string }>().catch(() => null);
  if (!body?.response?.id) return c.json({ error: "bad_request" }, 400);
  const email = await verifyLogin(c.env, new URL(c.req.url), body.response);
  if (!email) return c.json({ error: "prijava nije uspjela" }, 401);
  return startSession(c, email, "passkey", safeNext(body.next), true);
});

admin.post("/admin/passkey/register/options", async (c) =>
  c.json(await registrationOptions(c.env, new URL(c.req.url), c.get("session").email)),
);

admin.post("/admin/passkey/register/verify", async (c) => {
  const body = await c.req.json<{ response?: RegistrationResponseJSON; label?: string }>().catch(() => null);
  if (!body?.response?.id) return c.json({ error: "bad_request" }, 400);
  const ok = await verifyRegistration(
    c.env, new URL(c.req.url), c.get("session").email, body.response, (body.label ?? "").trim(),
  );
  return ok ? c.json({ ok: true }) : c.json({ error: "upis nije uspio" }, 400);
});

admin.post("/admin/passkeys/:id/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM admin_passkeys WHERE id = ? AND email = ?")
    .bind(c.req.param("id"), c.get("session").email)
    .run();
  return c.redirect("/admin/passkeys", 303);
});

admin.post("/admin/logout", async (c) => {
  await deleteSession(c.env, c.req.header("cookie") ?? null);
  c.header("set-cookie", sessionCookie("", 0));
  return c.redirect("/admin/login", 303);
});

admin.get("/admin", async (c) => {
  const device = c.req.query("device") || undefined;
  const pkg = c.req.query("package") || undefined;
  const beforeRaw = Number(c.req.query("before"));
  const before = Number.isSafeInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
  const [events, filters] = await Promise.all([listEvents(c.env, { device, pkg, before }), filterValues(c.env)]);
  return c.html(
    <EventsPage
      session={c.get("session")}
      events={events}
      devices={filters.devices}
      packages={filters.packages}
      device={device}
      pkg={pkg}
      firstPage={!before}
      nextBefore={events.length === PAGE_SIZE ? events[events.length - 1].id : null}
    />,
  );
});
admin.get("/admin/", (c) => c.redirect("/admin", 301));

admin.get("/admin/events/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const event = Number.isSafeInteger(id) ? await getEvent(c.env, id) : null;
  if (!event) return c.text("Događaj ne postoji.", 404);
  return c.html(<EventPage session={c.get("session")} event={event} />);
});

// WebSocket za live prikaz. Preglednik uz upgrade šalje kolačić, pa vrijedi
// ista sesija; Origin se provjerava jer WebSocket nema CORS zaštitu (CSWSH).
admin.get("/admin/live", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.text("expected websocket", 426);
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "bad_origin" }, 403);
  const session = c.get("session");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-admin-email", session.email);
  headers.set("x-admin-session-expires", session.expiresAt);
  return liveFeed(c.env).fetch(new Request(c.req.url, { headers }));
});

admin.get("/admin/devices", async (c) =>
  c.html(<DevicesPage session={c.get("session")} devices={await deviceStatuses(c.env)} staleMinutes={STALE_HEARTBEAT_MINUTES} />),
);

admin.get("/admin/conflicts", async (c) =>
  c.html(<ConflictsPage session={c.get("session")} conflicts={await listConflicts(c.env)} />),
);

admin.get("/admin/passkeys", async (c) =>
  c.html(<PasskeysPage session={c.get("session")} passkeys={await listPasskeys(c.env, c.get("session").email)} />),
);

admin.notFound((c) => c.text("Nema takve stranice.", 404));
admin.onError((err, c) => {
  console.error(JSON.stringify({ msg: "admin_error", err: String(err) }));
  return c.text("Greška.", 500);
});
