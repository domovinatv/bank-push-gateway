# Kolektor: MacroDroid (rezervni)

> **Status:** rezervna opcija. Primarni kolektor je vlastita aplikacija
> (`android/`, vidi [collector-android.md](collector-android.md)) jer potpisuje
> HMAC-om, ima trajni red i retry. MacroDroid ostaje za brzi test na telefonu
> na kojem se ne želi instalirati debug build.

## Odluka: token umjesto HMAC-a (6.10.2026.)

Worker prihvaća dva načina autentikacije (`worker/src/auth.ts`):

| Način | Zaglavlja | Tko |
|---|---|---|
| HMAC (zadano) | `X-Device-Id`, `X-Timestamp`, `X-Signature = hex(HMAC-SHA256(tajna, "<ts>.<tijelo>"))` | vlastita aplikacija, curl |
| Token | `X-Device-Id`, `Authorization: Bearer <tajna>` | samo uređaji navedeni u `TOKEN_AUTH_DEVICES` |

MacroDroid ne može pouzdano potpisati tijelo zahtjeva: HTTP akcija sama gradi
tijelo (form-urlencoded) nakon zamjene magic texta, pa skripta ne zna točne
bajtove koje treba potpisati. Zato MacroDroid koristi **token**:

- token je ista tajna kao za HMAC; ide samo preko HTTPS-a;
- dopušten je **samo** za uređaje izričito navedene u `TOKEN_AUTH_DEVICES`
  (`wrangler.jsonc` → `vars`); svi ostali moraju potpisivati;
- nema zaštite od replaya, ali replay ne može dodati nov događaj: dedup po
  `(device_id, seq)` vraća `duplicate`;
- kad MacroDroid uređaj prijeđe na vlastitu aplikaciju, makni ga iz
  `TOKEN_AUTH_DEVICES` i promijeni tajnu.

## Recept

Preduvjet: MacroDroid ima dozvolu *Notification access*. Na telefonu ništa
drugo osim bankovnih aplikacija i MacroDroida (CLAUDE.md §Sigurnost).

1. **Varijabla:** globalna cjelobrojna `gw_seq`, početna vrijednost =
   trenutno vrijeme u sekundama (npr. `1791290000`), da reset ne sudari seq sa
   starim događajima. Ako se ipak sudari, Worker drukčiji sadržaj sprema u
   `raw_event_conflicts` — ništa se ne gubi.
2. **Okidač:** *Notification Received* → *Select application(s)* → samo paketi
   iz allowlista (`co.infinum.hpb`, …, vidi `android/…/BankPackages.kt`);
   *Text content*: *Any*.
3. **Akcija 1:** *Set Variable* → `gw_seq` = `{v=gw_seq}+1`.
4. **Akcija 2:** *HTTP Request*
   - Method `POST`, URL `https://<worker>/ingest`
   - Headers: `X-Device-Id: gw-md-01`, `Authorization: Bearer <tajna>`
   - Body: *Form data* (MacroDroid ga sam URL-enkodira, pa navodnici i novi
     redovi iz teksta banke ne kvare tijelo — zato ne JSON):

     | ključ | vrijednost (magic text) |
     |---|---|
     | `seq` | `{v=gw_seq}` |
     | `package` | `{not_app_package}` |
     | `title` | `{not_title}` |
     | `text` | `{notification}` |
     | `big_text` | `{not_text_big}` |
     | `captured_at` | `{system_time}` |

   - Nazivi magic text polja u tablici su okvirni (neprovjereni na uređaju);
     točne odaberi iz
     izbornika *…* → *Magic text* → *Notification*. Ako neko polje ne postoji,
     izostavi ga — Worker sprema cijelo tijelo kakvo jest.
5. **Heartbeat:** zaseban makro, okidač *Regular Interval* 5 min → *HTTP
   Request* `POST /heartbeat`, ista zaglavlja, body `battery={battery}`.

Worker za `seq` traži nenegativan cijeli broj; ostala polja ne parsira.

## Ograničenja MacroDroida

- **Nema reda ni retryja:** ako mreža ne radi u trenutku obavijesti, događaj
  je izgubljen (vidljivo kao rupa u `seq`). Zato je samo rezervna opcija.
- `channel_id`, `notification_key` i `textLines` nisu dostupni.
- Kapacitet besplatne verzije: 5 makroa (dovoljno: 2).

## Provjera

```bash
cd worker
npx wrangler d1 execute bank_push_gateway --local \
  --command "SELECT id, device_id, seq, auth_method, package FROM raw_events ORDER BY id DESC LIMIT 5"
```
