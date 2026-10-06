# Faza 0: postav, mjerenja i zamke (6.10.2026.)

Što je jedna sesija morala otkriti, a ne vidi se iz koda. Kako stvari rade:
[`collector-android.md`](collector-android.md), [`admin.md`](admin.md),
[`../worker/README.md`](../worker/README.md).

## Stanje produkcije

| Što | Gdje |
|---|---|
| Worker | `https://bank-push-gateway.domovina.ai` (CF račun D.O.M. `7dc7167b…`), `workers.dev` isključen |
| D1 | `bank_push_gateway` (eeur), migracije `0001_init`, `0002_admin` |
| Durable Object | `LiveFeed` (migracija `v1`) |
| Access | tim `domovina.cloudflareaccess.com`, aplikacija „bank-push-gateway admin (sso)" na `/admin/sso`, IdP One-time PIN |
| Tajne uređaja | `config/devices.local.json` (gitignored) → `wrangler secret put DEVICE_SECRETS` |
| Passkey | jedan, `stepanic.matija@gmail.com`, oznaka `ms-mac-mini-apple-passwords` |

| Uređaj | Serijski | Android | device_id | Bankovne aplikacije |
|---|---|---|---|---|
| motorola edge 30 ultra | `ZY22G9DDR3` | 15 (API 35) | `gw-01` | HPB (`co.infinum.hpb`) |
| moto g86 5G | `ZY32M4Q2GJ` | 16 (API 36) | `gw-02` | nijedna (predviđen za PBZ test) |

Na oba je debug build (`ai.domovina.bankpush.debug`), endpoint produkcija.

## Mjerenja

- Telefon → Worker → D1 (`201`): **~0,2 s** od dodira „Testna obavijest" do
  odgovora (edge 30 ultra, Wi-Fi). Isto vrijeme do retka u adminu preko WebSocketa.
- Kašnjenje u adminu (`received_at − captured_at`): `gw-01` ~0,1 s, `gw-02`
  stalno ~1,25 s. Vjerojatno **sat moto g86 kasni ~1 s**, ne mreža —
  `captured_at` je sat telefona. Za stvarno kašnjenje banke mjeriti od vremena
  slanja uplate (zapisati ručno), ne od `captured_at`.
- Offline red: bez veze događaj čeka u SQLite redu; po povratku poslan po redu
  (provjereno na g86 s `adb reverse --remove`).

## Odbačene alternative

- **MacroDroid kao primarni kolektor** — ne može potpisati tijelo (HTTP akcija
  sama gradi form-body), nema reda ni retryja. Ostao rezervni recept s tokenom.
- **Fork `ItsAzni/NotificationForwarder`** — vlastiti kod bez ovisnosti je
  manji i pregledniji (zahtjev CLAUDE.md §Sigurnost: mali, pregledan kod).
- **Room / WorkManager / OkHttp** — nijedna ovisnost; `SQLiteOpenHelper`,
  `HttpURLConnection`, retry iz listenerova tick-a (1 min).
- **Admin kao HTML u template stringovima** (pay.domovina.ai) — odbačeno zbog
  ručnog escapeanja nepovjerljivog teksta obavijesti; Hono JSX escapea sam.
- **Vite SPA / Astro** za admin — nepotreban build korak do faze 2.
- **Basic Auth** — zamijenjen passkeyem + Accessom; Access je ujedno oporavak,
  pa nema break-glass tokena.
- **Polling umjesto WebSocketa** — vlasnik izabrao DO + WebSocket (< 100 ms).

## Zamke

| Zamka | Simptom | Rješenje |
|---|---|---|
| `Referrer-Policy: no-referrer` | odjava → `bad_origin`; fetch() radi | preglednik na `<form>` POST šalje `Origin: null`; koristiti `same-origin` |
| `@cloudflare/vitest-plugin` 1.3 nema izolaciju storagea po testu | testovi vide retke iz drugih testova | `beforeEach` briše tablice |
| `exports.default` iz `cloudflare:workers` bez tipova | TS2339 | cast na `Fetcher` |
| `routes` s `custom_domain` u wrangler configu | `workers.dev` se tiho isključi, telefoni na staroj adresi padnu | prebaciti uređaje prije/odmah; `workers_dev: false` eksplicitno |
| Svježi `workers.dev` / custom domena | curl s laptopa `error code: 1042` ili 404 prvih ~10 s | pričekati; telefoni su istodobno prolazili |
| Novi deploy | preglednik prvih ~10 s dobije staru verziju stranice | ponovno učitati |
| curl preko HTTP/2 | `upgrade: websocket` se odbaci, dobiješ 302 umjesto 401 | `curl --http1.1` |
| AGP 9.2.1 | traži Gradle ≥ 9.4.1 | wrapper 9.5.1 |
| Android 15+ edge-to-edge (`targetSdk` 36) | gumbi ispod navigacijske trake | `setOnApplyWindowInsetsListener` na ScrollView |
| wrangler OAuth token nema Access scope | ne može kreirati Access aplikaciju | API dashboarda iz prijavljenog taba (`fetch('/api/v4/accounts/<id>/access/apps', {headers: {'x-cross-site-security': 'dash'}})`) |
| `adb install` | — | dozvola za obavijesti radi bez „Allow restricted settings"; dodjela i preko `cmd notification allow_listener` |
| `am start -S` s novim endpointom | — | listener se ponovno spoji, red se pošalje na novi endpoint |

## Otvoreno

1. **PBZ test (sljedeći korak):** PBZ (`hr.asseco.android.intesa.isbd.pbz`) na
   moto g86 (`gw-02`), Revolut SEPA Instant 1 € na vlasnikov PBZ IBAN, zapisati
   vrijeme slanja. Provjeriti prije aktivacije: odjavljuje li PBZ aktivacija
   glavni telefon. Ishod → `docs/banks/pbz.md` (anonimizirano).
2. **HPB test:** obična i instant uplata na HPB poslovni (`gw-01`) → `docs/banks/hpb.md`.
3. Android 15/16 *sensitive notifications*: cenzurira li tekst priljeva.
4. Retci bez naslova u adminu (#5, #9) — vjerojatno Androidov group summary
   (`is_group_summary`); potvrditi na pravoj banci.
5. Faza 3: release build i potpisivanje, provizioniranje tajne bez adb-a,
   retry kad listener nije spojen.
6. Pre-commit hook za `HR\d{19}` / `EE\d{18}` (plan, faza 1).
