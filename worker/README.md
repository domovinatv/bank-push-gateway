# Worker

Faza 0: samo bilježi. Ne parsira tekst obavijesti.

| Ruta | Auth | Što radi |
|---|---|---|
| `GET /health` | — | `{"ok":true,"db":"ok"}` |
| `POST /ingest` | HMAC (ili token, vidi `docs/collector-macrodroid.md`) | sprema tijelo bajt za bajt u `raw_events`; dedup po `(device_id, seq)` |
| `POST /heartbeat` | isto | zapis u `heartbeats` |

`/ingest` prima `application/json` ili `application/x-www-form-urlencoded`
s obaveznim cijelim `seq`. Odgovori:

| Status | Tijelo | Značenje |
|---|---|---|
| 201 | `{"status":"stored","id","seq"}` | novo |
| 200 | `{"status":"duplicate","id","seq"}` | ponovljeni pokušaj, isti sadržaj |
| 200 | `{"status":"seq_conflict_stored","conflict_id","seq"}` | isti seq, drukčiji sadržaj → `raw_event_conflicts` |
| 400 | `bad_body` / `bad_seq` / `device_id_mismatch` | trajno, telefon ne ponavlja |
| 401 | `missing_signature` / `bad_signature` / `stale_timestamp` / … | tajna ili sat (±300 s) |
| 413 | `body_too_large` | > 64 KiB |

## Potpis

```
X-Device-Id: gw-01
X-Timestamp: <unix sekunde>
X-Signature: hex(HMAC-SHA256(tajna, "<X-Timestamp>.<tijelo>"))
```

Tajne: `DEVICE_SECRETS` = JSON `{"gw-01": "<tajna>"}`, lokalno u
`worker/.dev.vars` (gitignored, predložak `.dev.vars.example`), u produkciji
`wrangler secret put DEVICE_SECRETS`. Tajna: `openssl rand -hex 32`.

## Lokalni razvoj

```bash
npm install
cp .dev.vars.example .dev.vars        # upiši tajne
npm run db:migrate:local
npm run dev                            # http://localhost:8787 (i 0.0.0.0)

export GW_DEVICE=gw-dev-01 GW_SECRET=<tajna iz .dev.vars>
scripts/signed-curl.sh /ingest '{"seq":1,"package":"test","extras":{"android.text":"test"}}'
# {"status":"stored","id":1,"seq":1}
scripts/signed-curl.sh /heartbeat '{"battery":90}'

npx wrangler d1 execute bank_push_gateway --local \
  --command "SELECT id, device_id, seq, package FROM raw_events ORDER BY id DESC LIMIT 10"
```

Ručni curl bez skripte:

```bash
ts=$(date +%s); body='{"seq":2}'
sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$GW_SECRET" -r | cut -d' ' -f1)
curl -X POST localhost:8787/ingest -H 'content-type: application/json' \
  -H "x-device-id: $GW_DEVICE" -H "x-timestamp: $ts" -H "x-signature: $sig" -d "$body"
```

## Testovi

```bash
npm test          # vitest u workerd runtimeu (HMAC, dedup, konflikti, auth)
npm run typecheck
```

## Deploy

Još nije napravljen. Prije deploya: vlasnik bira Cloudflare račun, zatim
`wrangler d1 create bank_push_gateway` (pravi `database_id` u
`wrangler.jsonc`), `wrangler d1 migrations apply bank_push_gateway --remote`,
`wrangler secret put DEVICE_SECRETS`, `wrangler deploy`.
