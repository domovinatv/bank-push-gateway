import { env, exports } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyAccessJwt } from "../src/admin/access";
import { consumeChallenge, createSession, safeNext, SESSION_COOKIE, storeChallenge } from "../src/admin/session";

const worker = (exports as unknown as { default: Fetcher }).default;
const BASE = "https://gw.test";

beforeEach(async () => {
  await env.DB.batch(
    ["raw_events", "heartbeats", "admin_sessions", "admin_passkeys", "admin_challenges"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

async function cookieFor(email = "admin@test.hr") {
  return `${SESSION_COOKIE}=${await createSession(env, email, "passkey", "test")}`;
}

function get(path: string, cookie?: string) {
  return worker.fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
}

function post(path: string, opts: { cookie?: string; origin?: string | null; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin !== null) headers.origin = opts.origin ?? BASE;
  return worker.fetch(`${BASE}${path}`, {
    method: "POST", headers, body: JSON.stringify(opts.body ?? {}), redirect: "manual",
  });
}

describe("admin: pristup", () => {
  it("bez sesije preusmjerava na prijavu i pamti odredište", async () => {
    const res = await get("/admin/devices");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login?next=%2Fadmin%2Fdevices");
  });

  it("stranica prijave je javna i ima strogi CSP", async () => {
    const res = await get("/admin/login");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    // "no-referrer" bi natjerao preglednik da na <form> POST pošalje `Origin: null`.
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(await res.text()).toContain("Prijava passkeyem");
  });

  it("valjana sesija otvara admin", async () => {
    const res = await get("/admin", await cookieFor());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Sirovi događaji");
  });

  it("sesija e-maila koji nije u ADMIN_EMAILS ne vrijedi", async () => {
    const res = await get("/admin", await cookieFor("netko@drugi.hr"));
    expect(res.status).toBe(302);
  });

  it("istekla sesija ne vrijedi", async () => {
    const cookie = await cookieFor();
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await get("/admin", cookie)).status).toBe(302);
  });

  it("odjava briše sesiju", async () => {
    const cookie = await cookieFor();
    const res = await post("/admin/logout", { cookie });
    expect(res.status).toBe(303);
    expect((await get("/admin", cookie)).status).toBe(302);
  });

  it("odjava obrascem s istog origina prolazi", async () => {
    const cookie = await cookieFor();
    const res = await worker.fetch(`${BASE}/admin/logout`, {
      method: "POST", redirect: "manual",
      headers: { cookie, origin: BASE, "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("POST bez istog origina se odbija (CSRF)", async () => {
    const cookie = await cookieFor();
    expect((await post("/admin/logout", { cookie, origin: null })).status).toBe(403);
    expect((await post("/admin/logout", { cookie, origin: "https://zlo.example" })).status).toBe(403);
  });

  it("upis passkeya traži sesiju", async () => {
    expect((await post("/admin/passkey/register/options")).status).toBe(401);
    const res = await post("/admin/passkey/register/options", { cookie: await cookieFor() });
    expect(res.status).toBe(200);
    const opts = await res.json<{ rp: { id: string }; authenticatorSelection: { userVerification: string } }>();
    expect(opts.rp.id).toBe("gw.test");
    expect(opts.authenticatorSelection.userVerification).toBe("required");
  });

  it("prijava nepoznatim passkeyem ne prolazi", async () => {
    const res = await post("/admin/passkey/login/verify", {
      body: { response: { id: "nepostojeci", rawId: "nepostojeci", type: "public-key", response: {} } },
    });
    expect(res.status).toBe(401);
  });

  it("ne može obrisati tuđi passkey", async () => {
    await env.DB.prepare(
      "INSERT INTO admin_passkeys (id, email, public_key, label, created_at) VALUES ('k1', 'drugi@test.hr', 'x', 'x', '2026-01-01')",
    ).run();
    await post("/admin/passkeys/k1/delete", { cookie: await cookieFor() });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_passkeys").first<{ n: number }>();
    expect(row!.n).toBe(1);
  });

  it("/admin/sso bez JWT-a vraća na prijavu s greškom", async () => {
    const res = await get("/admin/sso");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login?error=access");
  });
});

describe("admin: prikaz", () => {
  it("escapea tekst obavijesti (XSS)", async () => {
    const body = JSON.stringify({
      seq: 1, package: "co.infinum.hpb", captured_at: "2026-10-06T12:00:00.000Z",
      extras: { "android.title": "<img src=x onerror=alert(1)>", "android.text": "Uplata <script>alert(1)</script>" },
    });
    await env.DB.prepare(
      `INSERT INTO raw_events (device_id, seq, received_at, auth_method, content_type, body, body_sha256, package, captured_at)
       VALUES ('gw-01', 1, '2026-10-06T12:00:01.500Z', 'hmac', 'application/json', ?, 'h', 'co.infinum.hpb', '2026-10-06T12:00:00.000Z')`,
    ).bind(body).run();
    const cookie = await cookieFor();
    for (const path of ["/admin", "/admin/events/1"]) {
      const html = await (await get(path, cookie)).text();
      expect(html, path).not.toContain("<script>alert(1)</script>");
      expect(html, path).not.toContain("<img src=x");
      expect(html, path).toContain("&lt;script&gt;");
    }
    expect(await (await get("/admin", cookie)).text()).toContain("1.50 s");
  });

  it("uređaj bez heartbeata je označen", async () => {
    const html = await (await get("/admin/devices", await cookieFor())).text();
    expect(html).toContain("gw-test-01");
    expect(html).toContain("nema heartbeata");
  });
});

describe("Access JWT", () => {
  const opts = { teamDomain: "tim.cloudflareaccess.com", aud: "aud-1" };

  async function setup() {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: string } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(o.iss ?? `https://${opts.teamDomain}`)
        .setAudience(o.aud ?? opts.aud)
        .setIssuedAt()
        .setExpirationTime(o.exp ?? "5m")
        .sign(privateKey);
    return { keys, sign };
  }

  it("prihvaća ispravan token i vraća e-mail malim slovima", async () => {
    const { keys, sign } = await setup();
    expect(await verifyAccessJwt(await sign({ email: "MS@ff.hr" }), opts, keys)).toEqual({ email: "ms@ff.hr" });
  });

  it("odbija krivi AUD, issuer i istekao token", async () => {
    const { keys, sign } = await setup();
    expect(await verifyAccessJwt(await sign({ email: "a@b.hr" }, { aud: "drugi" }), opts, keys)).toBeNull();
    expect(await verifyAccessJwt(await sign({ email: "a@b.hr" }, { iss: "https://zlo.example" }), opts, keys)).toBeNull();
    expect(await verifyAccessJwt(await sign({ email: "a@b.hr" }, { exp: "-1m" }), opts, keys)).toBeNull();
  });

  it("odbija token potpisan drugim ključem", async () => {
    const { keys } = await setup();
    const other = await setup();
    expect(await verifyAccessJwt(await other.sign({ email: "a@b.hr" }), opts, keys)).toBeNull();
  });
});

describe("WebAuthn izazov", () => {
  it("je jednokratan i vezan uz svrhu", async () => {
    await storeChallenge(env, "c1", "login", null);
    expect(await consumeChallenge(env, "c1", "register")).toBeNull();
    await storeChallenge(env, "c2", "login", null);
    expect(await consumeChallenge(env, "c2", "login")).toEqual({ email: null });
    expect(await consumeChallenge(env, "c2", "login")).toBeNull();
  });
});

describe("safeNext", () => {
  it("dopušta samo putanje unutar admina", () => {
    expect(safeNext("/admin/devices")).toBe("/admin/devices");
    expect(safeNext("https://zlo.example")).toBe("/admin");
    expect(safeNext("//zlo.example")).toBe("/admin");
    expect(safeNext("/admin\\@zlo")).toBe("/admin");
    expect(safeNext(undefined)).toBe("/admin");
  });
});

describe("admin: paginacija", () => {
  async function seed(n: number, device = "gw-01") {
    const stmts = Array.from({ length: n }, (_, i) =>
      env.DB.prepare(
        `INSERT INTO raw_events (device_id, seq, received_at, auth_method, content_type, body, body_sha256, package)
         VALUES (?, ?, '2026-10-06T12:00:00.000Z', 'hmac', 'application/json', '{}', 'h', 'p')`,
      ).bind(device, i + 1),
    );
    await env.DB.batch(stmts);
  }
  const rows = (html: string) => (html.match(/href="\/admin\/events\/\d+"/g) ?? []).length;

  it("dijeli na stranice, prikazuje ukupno i svodi preveliku stranicu na zadnju", async () => {
    await seed(60);
    const cookie = await cookieFor();
    const p1 = await (await get("/admin", cookie)).text();
    expect(rows(p1)).toBe(50);
    expect(p1).toContain("1–50 od <span class=\"events-total\">60</span>");
    expect(p1).toContain('href="/admin?page=2"');
    expect(p1).toContain('data-live="1"');

    const p2 = await (await get("/admin?page=2", cookie)).text();
    expect(rows(p2)).toBe(10);
    expect(p2).toContain('data-live="0"');
    expect(p2).toContain("51–60 od");

    expect(rows(await (await get("/admin?page=99", cookie)).text())).toBe(10);
    expect(rows(await (await get("/admin?page=-3", cookie)).text())).toBe(50);
  });

  it("veličina stranice samo s popisa, filter mijenja ukupno", async () => {
    await seed(30, "gw-01");
    await seed(5, "gw-02");
    const cookie = await cookieFor();
    const per25 = await (await get("/admin?per=25", cookie)).text();
    expect(rows(per25)).toBe(25);
    expect(per25).toContain('href="/admin?per=25&amp;page=2"');
    expect(rows(await (await get("/admin?per=7", cookie)).text())).toBe(35); // nepoznato → 50
    const filtered = await (await get("/admin?device=gw-02", cookie)).text();
    expect(rows(filtered)).toBe(5);
    expect(filtered).toContain("od <span class=\"events-total\">5</span>");
  });
});
