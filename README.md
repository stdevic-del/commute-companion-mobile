# Commute Companion 3.0 — News Scraper, Briefing Engine & Auto-Kokpit

Personalizovani jutarnji audio-kopilot za vozače koji kombinuje:
- **Server-Side News Scraper & RSS/HTML Agregator** (*RTS, N1, Danas, B92, BizLife, Netokracija, Startit, TechCrunch, Hacker News, AMSS, RHMZ* + korisnički URL/RSS izvori)
- **Solo ili Radio Duo sintezu glasa** (`gemini-3.8-flash` + `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` sa dva voditelja)
- **Deep-Dive Audio čitač celih članaka** u vožnji
- **Pravu interaktivnu geografsku mapu (0 €)** zasnovanu na *Leaflet + OpenStreetMap + OSRM* uličnom rutiranju
- **Radio-Miks & Spotify pult** i **Auto-Dock režim** (`MediaSession` komande na volanu + `Screen Wake Lock`)

---

## Pokretanje u Antigravity IDE (Lokalno okruženje)

### 1. Kloniranje repozitorijuma u Antigravity
Nakon što u Google AI Studiju kliknete na **Save to GitHub** (ili preuzmete ZIP), otvorite terminal u **Antigravity** editoru:

```bash
git clone <URL_TVOG_GITHUB_REPOZITORIJUMA>
cd commute-companion
```

### 2. Instalacija zavisnosti
```bash
npm install
```

### 3. Podešavanje API ključa (`.env.local`)
Kopirajte `.env.example` u `.env.local` i unesite svoj Gemini API ključ:

```bash
cp .env.example .env.local
```

U fajlu `.env.local` upišite:
```env
GEMINI_API_KEY=tvoj_gemini_api_kljuc
PORT=3000
```
*(Server u `server.ts` automatski učitava `.env.local` i `.env` prilikom pokretanja).*

### 4. Pokretanje razvojnog (Full-Stack) servera
```bash
npm run dev
```
Aplikacija i Express backend biće dostupni na: `http://localhost:3000`

---

## 5-slojni agregator vesti (`ingest/`)

Prikupljanje, deduplikacija, klasterovanje, rangiranje i RAM-only AI sinteza audio brifinga izvršavaju se asinhrono u pozadini preko GitHub Actions (`.github/workflows/osvezi-vesti.yml`, na svakih 10 minuta) u javnom `commute-companion-mobile` repozitorijumu i objavljuju statičke JSON fajlove na granu `news-feed`.

- **Konfiguracija izvora:** `ingest/sources.json` (uključivanje/isključivanje portala preko `enabled`, promena težine preko `weight`).
- **Lokalne komande:**
  - `npm run ingest:dry` — pregled plana provere izvora bez HTTP zahteva
  - `npm run ingest -- --only rts,danas` — lokalni test na izabranim izvorima
  - `npm run ingest:test` — kompletan skup automatskih testova (F0–F9)
- **AI audio brifing:** dodaj `GEMINI_API_KEY` u *Settings → Secrets and variables → Actions* repozitorijuma `commute-companion-mobile` (ako ključ nije podešen, worker radi bez pucanja i aplikacija koristi čist fallback).

---

## Beleške i ideje za buduće verzije (Roadmap)

### Radio Duo (Dvoglas — Jelena i Milan)
- **Status:** Privremeno isključeno iz korisničkog interfejsa (aplikacija trenutno koristi čist **Solo** glas kao podrazumevani režim dok se potpuno ne stabilizuje osnovni tok brifinga).
- **Ideja za vraćanje:** Kada osnovni Solo brifing bude u potpunosti testiran, vratiti opciju **Radio Duo (2 voditelja — Jelena i Milan)** sa dva potpuno različita, prirodna TTS glasa (ženski i muški glas koji naizmenično vode jutarnji program i komentarišu vesti i stanje na putu). Podrška za `hostFormat: 'duo'` i dijalog u `services/browserLiveEngine.ts` i `components/AudioPlayerHUD.tsx` je sačuvana ispod haube radi lakog ponovnog uključivanja.

