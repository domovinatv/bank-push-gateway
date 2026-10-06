# Arhitektura

```
[Android, namjenski telefon, bankovne aplikacije]
  NotificationListenerService
    → filter: allowlist paketa (+ channel_id gdje postoji)
    → spremi SIROVO u lokalni red (Room/SQLite)
    → POST /ingest + HMAC; retry dok server ne potvrdi primitak (po seq)
    → heartbeat svakih 5 min
        │
        ▼
[CF Worker]
  /ingest
    1. provjeri HMAC + device_id
    2. spremi sirovo (D1, payload u R2 ako je velik) — nikad ne briši
    3. dedup (notification_key + sadržaj; Android reposta ažurirane obavijesti)
    4. parser po banci → normalizirani događaj (ili `unparsed` + alarm)
    5. uparivanje s donacijom (poziv na broj → jedinstveni iznos → ručno)
    6. webhook pretplatnicima (potpisan)
  cron
    - heartbeat izostao > 15 min → alarm
    - dnevno usklađivanje s izvodom / PSD2 AIS
```

## Shema 1: sirovi događaj (telefon → Worker)

Telefon šalje sve iz `Notification.extras` jer banke stavljaju sadržaj na
različita mjesta (`text`, `bigText`, `textLines` kod grupiranih).

```json
{
  "device_id": "gw-hpb-01",
  "seq": 1842,
  "captured_at": "2026-10-06T14:03:11.402Z",
  "package": "co.infinum.hpb",
  "channel_id": "…",
  "notification_key": "0|co.infinum.hpb|1234|null|10123",
  "post_time": 1791295391000,
  "category": "msg",
  "extras": {
    "android.title": "…",
    "android.text": "…",
    "android.bigText": "…",
    "android.subText": "…",
    "android.textLines": ["…"]
  }
}
```

## Shema 2: normalizirani događaj (Worker → pretplatnici)

Stabilan ugovor, isti bez obzira na izvor (push, SMS, Monerium, PSD2).

```json
{
  "type": "account.credit",
  "id": "evt_…",
  "source": "android_push",
  "bank": "hpb",
  "account_hint": "…1234",
  "amount": { "value": "1.03", "currency": "EUR" },
  "balance_after": "523.17",
  "payer_name": null,
  "reference": null,
  "description": null,
  "occurred_at": "2026-10-06T14:03:09Z",
  "confidence": "amount_from_balance_delta",
  "raw_ref": "raw_…",
  "match": { "donation_id": "don_…", "method": "unique_amount" }
}
```

- `confidence`: `explicit` | `amount_from_balance_delta` | `inferred`
- `match.method`: `reference` | `unique_amount` | `manual` | `null`

## Uparivanje bez poziva na broj

Ako obavijest banke nema poziv na broj, svaka otvorena donacija dobiva
jedinstveni iznos (1,00 / 1,01 / 1,02 € …) s kratkim TTL-om — obrazac
„V免签" (szvone/vmqApk). Donator vidi točan iznos u HUB3 barkodu.

## Redoslijed

1. **Faza 0 — samo bilježi.** Kolektor (MacroDroid ili fork
   `ItsAzni/NotificationForwarder`) + Worker koji samo sprema sirovo.
   Nekoliko dana na stvarnim računima; po banci obična i instant uplata.
2. Parseri po banci; svaki (anonimizirani) uzorak = test.
3. Uparivanje + normalizirani webhook.
4. Usklađivanje, alarmi, vlastita Android aplikacija.
