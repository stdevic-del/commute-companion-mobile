# Commute Companion 3.0 — News Scraper, Briefing Engine & Radio-Miks

Ova faza nadograđuje **Commute Companion** pravim **News Scraper & Briefing Engine** sistemom na serveru. Umesto opštih sažetaka, aplikacija direktno povlači (skrejpuje) najnovije vesti, RSS feedove i cele članke sa domaćih i stranih portala, saobraćajnih servisa i URL linkova koje sami dodate, pretvarajući ih u kustoske audio brifove, dubinske priloge (*Deep-Dive*) i *Radio-Miks* program sa muzičkom podlogom i Spotify integracijom.

---

## Potvrđene Odluke Korisnika

> [!IMPORTANT]
> Sve odluke iz intervjua su ugrađene u arhitekturu ove faze:

- **Potvrđeno — Izvori za News Scraper (4 grupe izvora)**:
  1. **Domaći informativni i biznis portali**: *RTS, N1, B92, Danas, BizLife*
  2. **Domaći i strani IT/Tech portali**: *Netokracija, Startit, TechCrunch, Hacker News*
  3. **Saobraćajni i gradski servisni izvori**: *AMSS (stanje na putevima), Beoinfo, RHMZ (vremenska upozorenja)*
  4. **Korisnički URL / RSS izvori**: Mogućnost da korisnik unese bilo koji URL pojedinačnog članka, portala ili RSS feed-a koji želi u svom brifingu.
- **Potvrđeno — Način sastavljanja brifinga (Hibridni Kustos)**:
  - **Automatski kustos + Ručna selekcija (štikliranje/izbacivanje)**: Korisnik može jednim klikom da pusti automatski brifing (AI sam skrejpuje i bira najvažnije vesti), ili da otvori **Kustosku listu skrejpovanih vesti**, pregleda sveže povučene naslove, štiklira/izbaci konkretne članke i generiše brifing tačno od odabranih tekstova.
- **Potvrđeno — Deep-Dive Audio (Čitanje celog članka u vožnji)**:
  - Svaka skrejpovana vest i svaki uneti URL ima dugme **„Deep-Dive Audio"** — server skrejpuje kompletan tekst članka sa veb stranice (HTML ekstrakcija + Gemini `urlContext`) i generiše detaljan 2-minutni audio prilog samo o toj temi.
- **Potvrđeno — Radio-Miks Režim i Spotify Integracija**:
  - **Radio-Miks u plejeru**: Ambijentalna radio podloga sa *audio ducking* efektom (muzika se utiša dok voditelji govore i pojača na prelazima između poglavlja) + ugrađeni **Spotify Commute Deck** (učitavanje omiljene Spotify plejliste ili podkasta za vožnju kako biste na jednom ekranu kombinovali muziku i govorne brifove).

---

## 1. Pregled Sistema: Kako Radi Novi Briefing Engine

1. **Viotekanalni Server-Side Skrejper (`/api/scraper/feed` & `/api/scraper/article`)**:
   - Na Express serveru (`server.ts`) izvršava se paralelno povlačenje RSS XML tokova i HTML stranica sa odabranih portala (*RTS, N1, Danas, B92, BizLife, Netokracija, TechCrunch, Hacker News, AMSS, RHMZ*).
   - Za svaki članak izvlače se: **tačan naslov, izvor, kategorija, vreme objave, uvodni pasus (lead) i originalni URL**.
   - Ako korisnik nalepi sopstveni link ka članku ili portalu, server ga direktno parsira, izvlači glavni tekst članka (uklanja reklame, menije i skripte) i dodaje ga u kustosku korpu.

2. **Kustoski Pult (News Desk & Curation Panel)**:
   - U aplikaciji dobijate pregled **„Skrejpovane Vesti Uživo"** gde vidite stvarne naslove povučene sa portala pre nekoliko minuta.
   - Svaka vest je štiklirana po preporuci AI kustosa, ali možete jednim dodirom da uključite/isključite bilo koji naslov pre nego što kliknete **„Sastavi Audio Brifing od Odabranih Vesti"**.
   - Ako ste u žurbi i odmah kliknete **„Pokreni Brifing"**, server sam izvršava skrejpovanje u pozadini i pravi brifing od najvažnijih vesti.

3. **Deep-Dive Čitač Članaka (`/api/scraper/deep-dive`)**:
   - Kada tokom vožnje čujete kratku vest u brifingu i želite celu priču, kliknete na **„Deep-Dive (Ceo članak)"**.
   - Server skrejpuje kompletni tekst članka sa izvornog URL-a, prosleđuje ga `gemini-3.8-flash` modelu (uz `urlContext`) i `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` modelu i odmah reprodukuje detaljan radijski prilog.

4. **Radio-Miks & Spotify Muzički Pult**:
   - U okviru Audio Kokpita možete uključiti **„Radio-Miks Podlogu"** (Web Audio API generiše prijatne radio džinglove između poglavlja i tihu instrumentalnu podlogu ispod glasa voditelja, kao u pravom jutarnjem programu).
   - Dodat je i **Spotify Player Panel** gde možete izabrati predefinisane vozačke Spotify plejliste (*Daily Drive, Morning Acoustic, Synthwave Drive, Balkan Rock*) ili nalepiti link bilo koje svoje Spotify plejliste/epizode.

---

## 2. Tehnička Arhitektura i Tok Podataka

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                         KORISNIČKI INTERFEJS (React 19)                       │
│                                                                               │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────────┐  │
│  │  Kustoski Pult Vesti    │  │  Audio Kokpit &         │  │  Deep-Dive    │  │
│  │  • Izbor portala        │  │  Radio-Miks / Spotify   │  │  Čitač Članka │  │
│  │  • Štikliranje naslova  │  │  • Džinglovi po poglav. │  │  • Ceo tekst  │  │
│  │  • Unos sopstvenog URL  │  │  • Ducking + Plejlista  │  │    u Audio    │  │
│  └────────────┬────────────┘  └────────────┬────────────┘  └───────┬───────┘  │
└───────────────┼────────────────────────────┼───────────────────────┼──────────┘
                │                            │                       │
                ▼                            ▼                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                       BACKEND SKREJPER & AI ENGINE (server.ts)                │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. NEWS SCRAPER & RSS PARSER                                            │  │
│  │    • Paralelni fetch: RTS, N1, Danas, B92, BizLife, Netokracija,        │  │
│  │      TechCrunch, HackerNews, AMSS, RHMZ + Korisnički URL/RSS            │  │
│  │    • Čišćenje HTML/XML tagova i ekstrakcija čistog teksta članka        │  │
│  └────────────────────────────────────┬────────────────────────────────────┘  │
│                                       ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. GEMINI 3.8 BRIEFING & DEEP-DIVE GENERATOR                            │  │
│  │    • Model: gemini-3.8-flash (Tools: urlContext + googleSearch)         │  │
│  │    • Spaja stvarne skrejpovane članke u Solo ili Radio Duo scenario     │  │
│  │    • Sinteza glasa: gemini-3.8-flash-lite-tts / gemini-3.8-flash-tts    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ključne Proizvodne Odluke i Kompromisi

| Odluka | Izabrano Rešenje | Zašto (Prednosti) |
| :--- | :--- | :--- |
| **Arhitektura Skrejpera** | Server-side RSS/XML + HTML ekstrakcija u `server.ts` uz Gemini `urlContext` fallback | Izbegava sve CORS blokade pretraživača, radi brzo (paralelno povlačenje u <2s) i vraća stvarne današnje naslove i linkove sa domaćih i stranih portala |
| **Selekcija Vesti** | Automatski izbor + interaktivni štiklirani spisak (*Curated News Queue*) | Vozač koji žuri dobija brifing jednim klikom, a korisnik koji želi potpunu kontrolu može pre polaska da izabere tačno koje članke želi da čuje |
| **Deep-Dive Čitanje** | Poseban endpoint `/api/scraper/deep-dive` koji skrejpuje `<article>` / `<p>` paragrafe sa URL-a članka | Omogućava da se bilo koji zanimljiv naslov iz brifinga ili nalepljeni URL pretvori u dubinski 2-minutni audio prilog |
| **Radio-Miks & Spotify** | Web Audio API *Radio Bed & Jingle Synthesizer* + ugrađeni Spotify Embed plejer sa brzim preseta plejlistama | Pruža trenutni radijski doživljaj (džinglovi između poglavlja i pozadinska muzika) + direktno slušanje Spotify plejlista bez obaveznog plaćenog Spotify Developer OAuth ključa |
