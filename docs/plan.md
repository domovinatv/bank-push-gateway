# Plan

## Odluke (6.10.2026.)

- **Javni repo, MIT licenca.** Kod, sheme, parseri i dokumentacija su javni.
- **Podaci o računima nikad u gitu.** IBAN-ovi, imena vlasnika, mapiranje
  uređaj → račun, HMAC tajne i URL-ovi pretplatnika žive samo lokalno ili kao
  tajne u Cloudflareu (vidi §Podaci).
- **Sirovi uzorci obavijesti nikad u gitu** (sadrže imena uplatitelja, iznose,
  stanja). Testni fixturei su ručno anonimizirani.
- **Parseri su javni.** Format teksta obavijesti banke nije tajna; javni parseri
  su korisni svakome tko gradi isto.

## Podaci: gdje što živi

| Podatak | Gdje | U gitu |
|---|---|---|
| Računi (IBAN, vlasnik, banka, package, channel_id) | `config/accounts.local.json` | ❌ (`config/accounts.example.json` je predložak) |
| HMAC tajna po uređaju | `config/devices.local.json` → `wrangler secret put DEVICE_SECRETS`; `worker/.dev.vars` lokalno | ❌ |
| Pretplatnici webhooka (URL + tajna) | D1 tablica ili `wrangler secret` | ❌ |
| Konfiguracija Android kolektora (endpoint, device_id, tajna, allowlist) | SharedPreferences na telefonu (unos u aplikaciji; debug: adb intent) | ❌ |
| Sirovi događaji | D1 (+ R2) u produkciji; `samples/raw/` lokalno | ❌ |
| Anonimizirani fixturei za parsere | `worker/test/fixtures/` | ✅ |

Prije svakog commita: `git diff --cached` ne smije sadržavati `HR\d{19}`,
`EE\d{18}` ni stvarna imena. (Kandidat za pre-commit hook u fazi 1.)

## Faze

### Faza 0: samo bilježi
- `worker/`: CF Worker s `POST /ingest` (HMAC provjera, D1 insert sirovog
  događaja, dedup po `device_id + seq`), `GET /health`, heartbeat endpoint.
- Kolektor: vlastita aplikacija (`android/`, Kotlin, bez ovisnosti) odmah,
  umjesto MacroDroida — HMAC, trajni red i retry od prvog dana
  (`docs/collector-android.md`). MacroDroid ostaje rezervni recept s
  token-autentikacijom (`docs/collector-macrodroid.md`).
- Test: uplate po 1 € (obična i instant) između vlasnikovih računa
  (PBZ osobni → HPB poslovni i obrnuto); bilježiti vrijeme slanja.
- Izlaz: `docs/banks/<banka>.md` s anonimiziranim primjerom obavijesti,
  `channel_id`, kašnjenjem, ima li poziv na broj / ime uplatitelja.

### Faza 1: parseri
- Parser po banci (`worker/src/parsers/<bank>.ts`), čista funkcija
  `raw → NormalizedEvent | null`; svaki anonimizirani uzorak = test (vitest).
- Ponovno parsiranje svih sirovih događaja iz D1 nakon promjene parsera.
- Pre-commit hook za IBAN/imena.

### Faza 2: uparivanje + webhook
- Prvi pretplatnik: MPT rail kao „payment listener“ za hrvatski IBAN, **bez minta** —
  pay.domovina.ai [ADR 0020](https://github.com/domovinatv/pay.domovina.ai/blob/main/docs/decisions/0020-hr-iban-listener-bez-minta.md).
  Test 11.10.2026.: PBZ, HPB, RBA i Aircash čitaju HUB3, ali uplatu puštaju samo
  na HR IBAN, pa je ovaj gateway jedini brzi izvor dojave za taj kanal.
- Otvorene donacije s jedinstvenim iznosom (1,00 / 1,01 / …) i TTL-om, ili
  poziv na broj ako ga banka prenosi.
- Potpisani `account.credit` webhook pretplatnicima (MPT / donate / pay).
- Isti normalizirani format i za Monerium webhook i SMS izvor.

### Faza 3: pouzdanost
- Android kolektor: osnovno je napravljeno u fazi 0 (vlastiti kod, ne fork).
  Ostaje: foreground servis ili WorkManager za retry kad listener nije
  spojen, release potpisivanje, provizioniranje tajne bez adb-a.
- Cron: alarm kad heartbeat izostane > 15 min; dnevno usklađivanje (izvod ili PSD2 AIS).

## Otvoreno
- Erste: postoji li ErsteConnect Premium webhook za manje klijente (ako da,
  za Erste ne treba gateway).
- Android 15 „sensitive notifications": cenzurira li obavijest o priljevu.
- Jesu li push obavijesti za poslovne račune iste kao za osobne (po banci).

## Vezani dokumenti
- pay.domovina.ai [ADR 0020 — MPT listener za HR IBAN](https://github.com/domovinatv/pay.domovina.ai/blob/main/docs/decisions/0020-hr-iban-listener-bez-minta.md), [HUB3 format i test u bankama](https://github.com/domovinatv/pay.domovina.ai/blob/main/docs/research/aircash/05-hub3-format-provjera.md)
- [Faza 0: postav, mjerenja i zamke (6.10.2026.)](2026-10-06-faza-0-postav-i-zamke.md)
- [Android kolektor](collector-android.md), [MacroDroid](collector-macrodroid.md), [Admin](admin.md)
