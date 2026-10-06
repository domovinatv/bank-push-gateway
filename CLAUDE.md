# CLAUDE.md

## Što je ovaj repo

Gateway koji push obavijesti bankovnih aplikacija (Android) pretvara u
webhook za dolazne uplate. Primarni korisnik: donacije DOMOVINA projekta
(`donate.domovina.ai`, `pay.domovina.ai`).

## Hard-defined odluke

| Odluka | Vrijednost | Razlog |
|---|---|---|
| Telefon | ne parsira ništa, šalje sirove `extras` | promjena teksta banke = deploy Workera, ne nova verzija aplikacije |
| Sirovi događaji | spremaju se trajno, nikad ne brišu | ponovno parsiranje kad se parser popravi |
| Izvor istine | dnevni izvod / PSD2 usklađivanje | push je okidač, nema pravnu snagu |
| Platforma | Android (`NotificationListenerService`) | iOS nema API za čitanje tuđih obavijesti |
| Server | Cloudflare Worker (+ D1/R2) | konzistentno s DOMOVINA infrastrukturom |
| Repo | javni, MIT | kod i parseri su javni; podaci o računima nisu (vidi `docs/plan.md` §Podaci) |

## Sigurnost

- Telefon je namjenski: samo bankovne aplikacije + kolektor. Nikakve druge aplikacije.
- Kolektor samo ČITA obavijesti. Nikad ne automatizira bankovnu aplikaciju
  (nema Accessibility servisa, nema klikanja).
- Svaki zahtjev potpisan HMAC-om po uređaju; Worker odbija nepotpisano.
- Sirovi uzorci obavijesti sadrže stvarne transakcije (imena, iznose, stanja):
  ne commitati ih. Za testove koristiti anonimizirane fixtureove.
- Ne koristiti velike tuđe forwardere (npr. SmsForwarder) na uređaju s
  bankovnom sesijom — samo mali, pregledan kod.

## Podaci o računima

IBAN-ovi, imena vlasnika, mapiranje uređaj → račun i tajne žive samo u
gitignored datotekama (`config/*.local.json`, `worker/.dev.vars`) ili kao
`wrangler secret`. Predložak: `config/accounts.example.json`. Prije commita
provjeri `git diff --cached` za `HR\d{19}` / `EE\d{18}` i stvarna imena.

## Konvencije

- Dokumentacija i commit poruke: hrvatski; identifikatori u kodu: engleski.
- Konvencionalni commitovi (`feat:`, `fix:`, `docs:`, `chore:`).
