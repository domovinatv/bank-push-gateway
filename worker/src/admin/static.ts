// Statički CSS i JS za admin. Servira se kao zasebne datoteke, pa CSP može
// zabraniti inline skripte (script-src 'self').

// Paleta i okvir isti kao pay.domovina.ai/backend/src/admin/views.ts.
export const ADMIN_CSS = `
:root {
  --navy: #002F6C; --red: #FF0000; --muted: #5A6570;
  --border: #E1E5EA; --surface: #F5F7F9; --bg: #FFFFFF;
  --success: #2E8540; --warning: #B45309; --danger: #B42318;
  font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--navy); }
a { color: var(--navy); }
.tricolor { display: flex; height: 6px; }
.tricolor span { flex: 1; }
.tricolor .red { background: var(--red); }
.tricolor .white { background: #fff; }
.tricolor .navy { background: var(--navy); }
header { padding: .9rem 1.5rem; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
header .brand { display: flex; align-items: center; gap: .6rem; text-decoration: none; }
header .brand .word { font-weight: 800; letter-spacing: .04em; font-size: 1.1rem; }
header .brand .accent { color: var(--red); }
header nav { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
header nav a { text-decoration: none; font-weight: 600; }
header nav a.active { border-bottom: 2px solid var(--red); }
header .who { color: var(--muted); font-size: .85rem; display: flex; gap: .6rem; align-items: center; }
main { padding: 1.25rem 1.5rem 3rem; max-width: 1400px; margin: 0 auto; }
h1 { font-size: 1.35rem; margin: .2rem 0 1rem; }
h2 { font-size: 1.1rem; margin: 1.5rem 0 .6rem; }
.muted { color: var(--muted); }
.small { font-size: .82rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th, td { text-align: left; padding: .5rem .65rem; border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: var(--surface); font-weight: 700; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td.text { min-width: 22rem; white-space: pre-wrap; word-break: break-word; }
td.nowrap, .nowrap { white-space: nowrap; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; }
pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .9rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
.badge { display: inline-block; padding: .1rem .45rem; border-radius: 999px; font-size: .75rem;
  font-weight: 700; border: 1px solid currentColor; }
.ok { color: var(--success); } .warn { color: var(--warning); } .bad { color: var(--danger); }
form.filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: end; margin-bottom: 1rem; }
label { display: grid; gap: .2rem; font-size: .8rem; color: var(--muted); }
select, input[type=text] { font: inherit; padding: .4rem .5rem; border: 1px solid var(--border);
  border-radius: 6px; color: var(--navy); background: #fff; min-width: 12rem; }
button, .button { font: inherit; font-weight: 600; padding: .45rem .9rem; border-radius: 6px;
  border: 1px solid var(--navy); background: var(--navy); color: #fff; cursor: pointer; text-decoration: none;
  display: inline-block; }
button.secondary, .button.secondary { background: #fff; color: var(--navy); }
button.danger { background: #fff; color: var(--danger); border-color: var(--danger); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1rem; }
.card { border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }
.card h3 { margin: 0 0 .5rem; font-size: 1rem; display: flex; justify-content: space-between; gap: .5rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .9rem; margin: 0; font-size: .88rem; }
dt { color: var(--muted); }
dd { margin: 0; word-break: break-word; }
.login { max-width: 26rem; margin: 4rem auto; display: grid; gap: 1rem; text-align: center; }
.login .button, .login button { width: 100%; padding: .75rem; }
.msg { padding: .6rem .8rem; border-radius: 6px; background: var(--surface); }
.msg.bad { background: #FEF3F2; }
.pager { margin-top: 1rem; display: flex; gap: .6rem; }
`;

// Passkey ceremonije u pregledniku. Bez biblioteke: modern preglednici imaju
// PublicKeyCredential.parse*OptionsFromJSON i credential.toJSON(); za starije
// je ovdje ručna base64url pretvorba.
export const PASSKEY_JS = `
"use strict";
const b64uToBuf = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer;
};
const bufToB64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");

function credToJSON(c) {
  if (typeof c.toJSON === "function") return c.toJSON();
  const r = c.response;
  const response = { clientDataJSON: bufToB64u(r.clientDataJSON) };
  if (r.attestationObject) {
    response.attestationObject = bufToB64u(r.attestationObject);
    response.transports = r.getTransports ? r.getTransports() : [];
  } else {
    response.authenticatorData = bufToB64u(r.authenticatorData);
    response.signature = bufToB64u(r.signature);
    if (r.userHandle) response.userHandle = bufToB64u(r.userHandle);
  }
  return { id: c.id, rawId: bufToB64u(c.rawId), type: c.type, response,
    clientExtensionResults: c.getClientExtensionResults(), authenticatorAttachment: c.authenticatorAttachment };
}

function requestOptions(o) {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return PublicKeyCredential.parseRequestOptionsFromJSON(o);
  return { ...o, challenge: b64uToBuf(o.challenge),
    allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
}

function creationOptions(o) {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return PublicKeyCredential.parseCreationOptionsFromJSON(o);
  return { ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
}

function show(el, text, bad) {
  if (!el) return;
  el.textContent = text;
  el.className = "msg" + (bad ? " bad" : "");
  el.hidden = false;
}

const loginBtn = document.getElementById("passkey-login");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const msg = document.getElementById("msg");
    try {
      const opts = await post("/admin/passkey/login/options");
      const cred = await navigator.credentials.get({ publicKey: requestOptions(opts) });
      const res = await post("/admin/passkey/login/verify", { response: credToJSON(cred), next: loginBtn.dataset.next });
      location.href = res.next;
    } catch (e) {
      show(msg, "Prijava nije uspjela: " + e.message, true);
    }
  });
}

const regForm = document.getElementById("passkey-register");
if (regForm) {
  regForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById("msg");
    try {
      const opts = await post("/admin/passkey/register/options");
      const cred = await navigator.credentials.create({ publicKey: creationOptions(opts) });
      await post("/admin/passkey/register/verify", { response: credToJSON(cred), label: regForm.label.value });
      location.reload();
    } catch (e) {
      show(msg, "Upis nije uspio: " + e.message, true);
    }
  });
}
`;

export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32" aria-hidden="true"><defs><linearGradient id="hdrFlag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF0000"/><stop offset="33.3%" stop-color="#FF0000"/><stop offset="33.3%" stop-color="#FFFFFF"/><stop offset="66.6%" stop-color="#FFFFFF"/><stop offset="66.6%" stop-color="#002F6C"/><stop offset="100%" stop-color="#002F6C"/></linearGradient></defs><rect width="512" height="512" rx="32" fill="white"/><path d="M72 64H248C354.071 64 440 149.929 440 256C440 362.071 354.071 448 248 448H72V64Z" fill="url(#hdrFlag)"/><path d="M168 160H248C301.019 160 344 202.981 344 256C344 309.019 301.019 352 248 352H168V160Z" fill="white"/></svg>`;
