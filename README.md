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

Ništa od toga još ne postoji — vidi [`docs/architecture.md`](docs/architecture.md)
za plan i redoslijed.

## Status

Faza 0: mod „samo bilježi" — skupiti stvarne obavijesti za svaku banku
(obična i instant uplata) prije pisanja ijednog parsera.
