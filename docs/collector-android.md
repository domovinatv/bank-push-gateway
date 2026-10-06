# Kolektor: vlastita Android aplikacija

`android/` — Kotlin, bez ovisnosti osim Kotlin stdliba (kod na telefonu s
bankovnom sesijom mora biti mali i pregledan). `minSdk` 29, `targetSdk` 36.

## Što radi

```
NotificationListenerService.onNotificationPosted
  → paket nije na allowlistu? ignoriraj (ništa se ne sprema)
  → sirovi JSON: omotnica + SVI extras (Shema 1, docs/architecture.md)
  → SQLite red (lokalni dedup po key + post_time + extras)
  → POST /ingest, HMAC; 2xx = potvrđeno, 400/413 = trajno odbijeno,
    ostalo = pokušaj ponovno (svake minute, strogo po redu)
  → heartbeat svakih 5 min dok je listener spojen
```

- `seq` = vrijeme prve instalacije (ms) + lokalni rowid; reinstalacija ne
  sudara seq sa starim događajima na serveru.
- Pri spajanju listenera uzima i trenutno aktivne obavijesti (one koje su
  stigle dok nije radio); lokalni dedup preskače već poslane.
- Potvrđeni događaji brišu se lokalno nakon 30 dana (server ih čuva zauvijek).
- Tajna i red isključeni su iz backupa (`allowBackup=false`,
  `data_extraction_rules.xml`).
- Samo čita: nema Accessibility servisa, ne odgovara na obavijesti, ne
  otvara bankovne aplikacije.

| Datoteka | Uloga |
|---|---|
| `BankNotificationListener.kt` | listener, tick (retry 1 min, heartbeat 5 min) |
| `RawEvent.kt` | `StatusBarNotification` → JSON, bez parsiranja |
| `EventStore.kt` | SQLite red |
| `Gateway.kt` | jedna dretva: enqueue, flush, heartbeat |
| `Sender.kt`, `Signer.kt` | HTTP + HMAC (isti format kao `worker/src/auth.ts`) |
| `BankPackages.kt` | zadani allowlist |
| `debug/…/DebugTools.kt` | konfiguracija preko adb intenta, testna obavijest |

## Razvoj na fizičkom uređaju

Bez emulatora — debug build ide izravno na spojene telefone.

```bash
# 1. Worker lokalno (drugi terminal)
cd worker && npm run db:migrate:local && npm run dev

# 2. Build + instalacija na sve spojene uređaje
cd android && ./gradlew :app:assembleDebug
for s in $(adb devices | awk 'NR>1 && $2=="device"{print $1}'); do
  adb -s $s install -r -g app/build/outputs/apk/debug/app-debug.apk
  adb -s $s reverse tcp:8787 tcp:8787          # telefon: localhost:8787 → laptop
  adb -s $s shell cmd notification allow_listener \
    ai.domovina.bankpush.debug/ai.domovina.bankpush.BankNotificationListener
done

# 3. Konfiguracija (samo debug build; tajna iz worker/.dev.vars)
adb -s <serial> shell am start -n ai.domovina.bankpush.debug/ai.domovina.bankpush.MainActivity \
  --es endpoint http://localhost:8787 --es device_id gw-dev-01 --es secret '<tajna>'

# 4. Log
adb -s <serial> logcat -s BankPush
```

Prema produkciji: isti `am start`, ali `--es endpoint https://bank-push-gateway.domovina.ai`
i tajna iz `config/devices.local.json`.

Prikaz zaslona telefona na laptopu: `scrcpy -s <serial> --stay-awake`.

Debug build dopušta HTTP samo prema `localhost` (`adb reverse`); release
samo HTTPS. Debug build u allowlist dodaje vlastiti paket, pa gumb
*Testna obavijest* testira cijeli put bez bankovne aplikacije.

`adb install` nije „sideload" iz preglednika, pa Android 13+ *restricted
settings* ne blokira dozvolu za čitanje obavijesti. Kod instalacije APK-a iz
datoteke na telefonu: *Postavke → Aplikacije → Bank Push Collector → ⋮ →
Allow restricted settings*.

## Postavljanje namjenskog telefona

1. Dozvola za čitanje obavijesti (gumb u aplikaciji ili `cmd notification allow_listener`).
2. *Isključi optimizaciju baterije* (gumb). Motorola: i *Postavke → Baterija →
   Upravljanje pozadinom* → bez ograničenja.
3. U bankovnoj aplikaciji uključiti obavijesti o priljevu; u postavkama
   Androida ne utišavati kanal (utišane obavijesti se i dalje vide listeneru,
   ali neke banke ih tada ne šalju).
4. Android 15+: *sensitive notifications* može sakriti sadržaj obavijesti s
   OTP-om nepouzdanim listenerima. Za obavijesti o priljevu još neprovjereno —
   prvi stvarni uzorak će pokazati (`android.text` = „Sensitive notification
   content hidden").

## Testirano (6.10.2026.)

| Uređaj | Android | Rezultat |
|---|---|---|
| Motorola edge 30 ultra | 15 (API 35) | listener, heartbeat, testna obavijest → `201` |
| Motorola moto g86 5G | 16 (API 36) | isto + offline red: bez veze događaj čeka, po povratku poslan po redu |
