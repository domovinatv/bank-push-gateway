# Nalazi istraživanja (sažetak)

Puno: `donate.domovina.ai/docs/research/2026-10-06-*.md` i `raw/`.

## Zašto gateway

- HR IBAN + webhook za dolazne uplate: nijedna banka/EMI ne nudi javno
  (Revolut Business daje LT IBAN; Wise, Paysera bez HR IBAN-a; Aircash samo
  fizičke osobe). Pitati Erste za ErsteConnect Premium (navodno webhookovi).
- PSD2 AIS: max 4 pozadinska čitanja / 24 h; Enable Banking pokriva ZABA,
  PBZ, Erste, RBA (OTP ne); webhook samo za status plaćanja.
- SMS „u realnom vremenu": RBA mDIREKT (poslovni). HPB SMS/e-mail u paketima.

## Android aplikacije i push za priljev (statička analiza APK-ova)

| Banka | Package | Priljev push |
|---|---|---|
| ZABA | `hr.asseco.android.zaba.new` | ✅ („incoming funds"; web: „odmah") |
| PBZ | `hr.asseco.android.intesa.isbd.pbz` | ❓ Flutter, tekstovi sa servera |
| PBZ poslovni | `hr.pbz.digi4biz` | ❓ Flutter |
| Erste George | `hr.erstebank.george` | ✅ kanali `INCOMING_TRX`, `INSTANT_PAYMENT` |
| OTPgo | `hr.asseco.android.ae.otp` | ❓ APK nije skinut |
| RBA mojaRBA | `co.infinum.rba.eva` | ✅ „Uplate na račune" |
| HPB mHPB | `co.infinum.hpb` | ✅ „promjena po računu", sadrži stanje (vlasnik: poslovni push stiže odmah) |
| Addiko | `com.comtrade.HYPOnetmBankarstvo` | ✅ web; tekst možda generički |
| Podravska | `hr.asseco.android.ae.poba` | ✅ web |
| Partner | `hr.paba.leonus` | ✅ web |
| KentBank | `hr.kentbank.mkent` | ✅ web („u stvarnom vremenu") |
| Karlovačka | `hr.kaba.mbankretail`, `hr.kaba.mbankbiz` | ❓ |
| Agram / IKB / Slatinska / Samoborska (Banksoft) | `hr.banksoft.mobile.*` | ❓ isti dobavljač |

Sadržaj obavijesti (ime uplatitelja, poziv na broj) dolazi u FCM payloadu sa
servera — zna se tek iz faze 0.

## Instant

HUB3 sken otvara obični nalog; instant je izbor po nalogu (PBZ: nije
automatski na kopiranim nalozima). Redovni idu kroz EuroNKS, instant kroz
EuroNKSInst (TIPS). Za POS-like UX donator mora uključiti Instant.

## Gotova open-source rješenja

`pppscn/SmsForwarder` (28k★), `szvone/vmqApk` + `vmqphp` (V免签),
`ItsAzni/NotificationForwarder` (MIT), `suriyadi15/qrishook` (MIT),
`capcom6/android-sms-gateway` (SMS).
