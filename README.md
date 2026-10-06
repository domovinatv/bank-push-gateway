# bank-push-gateway

Android telefon s bankovnim aplikacijama → `NotificationListenerService` →
HTTPS → Cloudflare Worker → normalizirani `account.credit` webhook.

Zašto: nijedna hrvatska banka danas ne daje pravnoj osobi HR IBAN s webhookom
za dolazne uplate, a PSD2 AIS (Enable Banking i sl.) smije čitati račun samo
4× dnevno (~6 h kašnjenja). Bankovne aplikacije pak šalju push o priljevu u
sekundi. Ovaj gateway taj push pretvara u webhook, za POS-like potvrdu
donacija na HUB3 / HR IBAN.

Istraživanje: `donate.domovina.ai/docs/research/` (2026-10-06), sažetak u
[`docs/research.md`](docs/research.md).

## Dijelovi

| Dio | Uloga |
|---|---|
| `android/` | glupi kolektor: allowlist paketa, sirovi `extras`, lokalni red, HMAC, retry, heartbeat |
| `worker/` | `/ingest`: spremi sirovo → dedup → parser po banci → uparivanje → webhook |
| `docs/` | arhitektura, sheme, nalazi po banci |

Plan: [`docs/plan.md`](docs/plan.md). Arhitektura: [`docs/architecture.md`](docs/architecture.md).
Kolektor: [`docs/collector-android.md`](docs/collector-android.md) (primarni),
[`docs/collector-macrodroid.md`](docs/collector-macrodroid.md) (rezervni).
Worker: [`worker/README.md`](worker/README.md).

## Status

Faza 0: mod „samo bilježi" — skupiti stvarne obavijesti za svaku banku
(obična i instant uplata) prije pisanja ijednog parsera.

- ✅ Worker (`/ingest`, `/heartbeat`, `/health`), D1 shema, testovi — lokalno.
- ✅ Android kolektor (Kotlin, bez ovisnosti), testiran na dva fizička uređaja
  (Android 15 i 16) protiv lokalnog Workera preko `adb reverse`.
- ✅ Worker u produkciji: `https://bank-push-gateway.d-o-m.workers.dev` (CF račun D.O.M.);
  oba telefona šalju na nju (`gw-01` edge 30 ultra s HPB-om, `gw-02` moto g86).
- ⏳ Test uplata PBZ ↔ HPB → `docs/banks/<banka>.md`.

## Licenca

MIT. Podaci o računima nisu dio repoa (`config/*.local.json`, gitignored).
