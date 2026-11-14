# -*- coding: utf-8 -*-
"""
OSVEZI SERVISE - automatsko citanje zvanicnih servisnih izvora za Commute Companion.

Izvori (samo cinjenice: ulica, opstina, vreme - ne autorski tekst):
  1. EDS  - planirana iskljucenja struje, Dan_0..Dan_3 (tabela)
  2. BVK  - "Kvarovi na mrezi" (opstina: ulica broj)
  3. BVK  - "Planirani radovi" (proza sa datumom, satnicom i ulicama)
  4. GSP  - bgprevoz.rs "Aktuelne izmene" i "Vanredne izmene" (linije + period vazenja)

Izlaz: jedan JSON fajl (podrazumevano data/servisi.json) koji aplikacija ucitava.

Pravila:
  - NE dira recnik.csv, eds.csv ni eds_istorija.csv.
  - NE salje upite Nominatimu (nema geokodiranja). Ulice koje nisu u recniku
    upisuju se u "nepoznate_ulice", pa o geokodiranju odlucuje covek.
  - Mejl za kontakt se ne pise u kod. Ako postoji promenljiva okruzenja
    KONTAKT, dodaje se u User-Agent; inace stoji samo adresa projekta.

Pokretanje:  python scrapers/osvezi_servise.py [putanja/izlaza.json]
Nema spoljnih biblioteka.
"""

import html as htmlmod
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

# ==================================================== 1. PODESAVANJA

EDS_ADRESA = "https://elektrodistribucija.rs/planirana-iskljucenja-beograd/Dan_{n}_Iskljucenja.htm"
EDS_DANI = [0, 1, 2, 3]
BVK_KVAROVI = "https://www.bvk.rs/kvarovi-na-mrezi/"
BVK_PLANIRANI = "https://www.bvk.rs/planirani-radovi/"
GSP_STRANICE = [
    ("aktuelne", "https://www.bgprevoz.rs/linije/aktuelne-izmene"),
    ("vanredne", "https://www.bgprevoz.rs/linije/vanredne-izmene"),
]
PAUZA = 1.5

APLIKACIJA = "commute-companion-servisi/1.0 (+https://github.com/stdevic-del/commute-companion-mobile)"

# Ista granica kao u eds_citac.py / suzi.py (uzi grad, odluka iz izvestaja).
OPSEG = ["Beograd", "Stari grad", "Savski venac", "Vracar", "Palilula",
         "Zvezdara", "Vozdovac", "Cukarica", "Rakovica", "Novi Beograd",
         "Zemun", "Surcin", "Obrenovac"]

BEOGRAD = timezone(timedelta(hours=1))  # CET; za poredjenje datuma dovoljno

# ==================================================== 2. PISMO I KLJUCEVI (kao u eds_citac.py)

CIR = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ", "е": "e",
       "ж": "ž", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj",
       "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s",
       "т": "t", "ћ": "ć", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "č",
       "џ": "dž", "ш": "š"}


def u_latinicu(s):
    out = []
    for z in s or "":
        m = CIR.get(z.lower())
        out.append(z if m is None else (m.upper() if z.isupper() else m))
    return "".join(out)


def kljuc(s):
    s = u_latinicu(s).lower().replace("đ", "dj")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\b(?:prvi|drugi|treci|cetvrti|\d+)\.?\s*deo\b.*$", " ", s)
    s = re.sub(r"\bbul\b\.?\s*", "bulevar ", s)
    s = re.sub(r"\bvoj\b\.?\s*", "vojvode ", s)
    s = re.sub(r"\bkralj\b\.?\s*", "kralja ", s)
    s = re.sub(r"\bknj\b\.?\s*", "kneginje ", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def lepo(s):
    mala = {"i", "na", "od", "do", "u", "za", "sa"}
    reci = u_latinicu(s).lower().split()
    return " ".join(r if (i and r in mala) else r[:1].upper() + r[1:]
                    for i, r in enumerate(reci))


OPSEG_K = [kljuc(o) for o in OPSEG]


def u_opsegu(opstina):
    k = kljuc(opstina)
    return any(o == k or o in k for o in OPSEG_K)


def nominativ(ulica):
    """Grubo vracanje iz lokativa: 'Hadzi Melentijevoj' -> 'Hadzi Melentijeva'."""
    reci = ulica.split()
    out = []
    for r in reci:
        if len(r) > 4 and r.lower().endswith("oj"):
            r = r[:-2] + "a"
        out.append(r)
    s = " ".join(out)
    return re.sub(r"\s+(ulici|ulica)$", "", s, flags=re.I).strip()


# ==================================================== 3. MREZA

def dekodiraj_bajtove(sirovo: bytes) -> str:
    for kod in ("utf-8-sig", "cp1251", "latin-1"):
        try:
            return sirovo.decode(kod)
        except UnicodeDecodeError:
            continue
    return sirovo.decode("utf-8", errors="replace")


def skini(url):
    ua = APLIKACIJA
    kontakt = os.environ.get("KONTAKT", "").strip()
    if kontakt:
        ua = f"{APLIKACIJA[:-1]}; {kontakt})"
    zahtev = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(zahtev, timeout=40) as o:
        sirovo = o.read()
    return dekodiraj_bajtove(sirovo)


def skini_browser(url):
    """Preuzima stranicu uz standardno zaglavlje pretrazivaca, SSL fallback i proxy fallback za sajtove iza GeoIP/WAF-a."""
    import ssl
    import urllib.parse

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sr-RS,sr;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    kandidati = [
        (url, True),
        (url, False),
        (f"https://r.jina.ai/{url}", True),
        (f"https://api.allorigins.win/raw?url={urllib.parse.quote(url, safe='')}", True),
        (f"https://corsproxy.io/?{urllib.parse.quote(url, safe='')}", True),
    ]
    poslednja_greska = None
    for cilj_url, proveri_ssl in kandidati:
        try:
            ctx = None if proveri_ssl else ssl._create_unverified_context()
            zahtev = urllib.request.Request(cilj_url, headers=headers)
            with urllib.request.urlopen(zahtev, timeout=30, context=ctx) as o:
                sirovo = o.read()
            tekst = dekodiraj_bajtove(sirovo)
            if tekst and len(tekst) > 200:
                return tekst
        except Exception as exc:  # noqa: BLE001
            poslednja_greska = exc
            continue
    raise RuntimeError(f"Neuspesno preuzimanje {url}: {poslednja_greska}")


def u_tekst(html):
    s = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", html)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</h\d>|</tr>|</div>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s).replace("\xa0", " ")
    s = "\n".join(re.sub(r"[ \t]+", " ", l).strip() for l in s.split("\n"))
    return re.sub(r"\n{2,}", "\n", s)


def iso_iz_tackastog(d):
    """'29.09.2026' -> '2026-09-29'."""
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", d or "")
    if not m:
        return ""
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"


def sat(s):
    """'08.30' / '8' / '18:00' -> '08:30' / '08:00' / '18:00'."""
    m = re.match(r"(\d{1,2})(?:[.:](\d{2}))?", s or "")
    if not m:
        return ""
    return f"{int(m.group(1)):02d}:{m.group(2) or '00'}"


# ==================================================== 4. EDS

class Tabela(HTMLParser):
    def __init__(self):
        super().__init__()
        self.redovi, self._red, self._celija = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._red = []
        elif tag in ("td", "th") and self._red is not None:
            self._celija = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._celija is not None:
            self._red.append(re.sub(r"\s+", " ", "".join(self._celija)).strip())
            self._celija = None
        elif tag == "tr" and self._red is not None:
            if self._red:
                self.redovi.append(self._red)
            self._red = None

    def handle_data(self, data):
        if self._celija is not None:
            self._celija.append(data)


RX_VREME = re.compile(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})")
RX_DATUM = re.compile(r"(\d{4}-\d{2}-\d{2})")
RX_NASELJE = re.compile(r"^(?:Насеље|Naselje)\s+(.+?):\s*(.*)$", re.I)
BEZ_IMENA = {"nema naziva ulica", "nema naziva"}


def razlozi_ulice(celija):
    naselje, out = "", []
    for deo in re.split(r",\s+", celija or ""):
        deo = deo.strip().strip(",").strip()
        if not deo:
            continue
        m = RX_NASELJE.match(deo)
        if m:
            naselje, deo = m.group(1).strip(), m.group(2).strip()
            if not deo:
                continue
        if ":" not in deo:
            continue
        ulica, brojevi = deo.rsplit(":", 1)
        ulica = ulica.strip()
        if not ulica or kljuc(ulica) in BEZ_IMENA:
            continue
        out.append((naselje, ulica, brojevi.strip().strip(",")))
    return out


def citaj_eds():
    redovi = []
    for n in EDS_DANI:
        try:
            html = skini(EDS_ADRESA.format(n=n))
        except Exception as e:  # noqa: BLE001
            print(f"  EDS Dan_{n}: greska - {e}")
            time.sleep(PAUZA)
            continue
        t = Tabela()
        t.feed(html)
        ceo = " ".join(" ".join(r) for r in t.redovi)
        m = RX_DATUM.search(ceo) or RX_DATUM.search(html)
        datum = m.group(1) if m else ""
        broj = 0
        for red in t.redovi:
            if len(red) < 3:
                continue
            v = RX_VREME.search(red[1])
            if not v or not u_opsegu(red[0]):
                continue
            for naselje, ulica, brojevi in razlozi_ulice(red[2]):
                redovi.append({
                    "datum": datum, "opstina": lepo(red[0]),
                    "od": v.group(1), "do": v.group(2),
                    "naselje": lepo(naselje), "ulica": lepo(ulica),
                    "brojevi": u_latinicu(brojevi), "ulicaCir": ulica,
                    "izvor": f"Dan_{n}",
                })
                broj += 1
        print(f"  EDS Dan_{n}: datum {datum or '?'}  {broj} ulica u opsegu")
        time.sleep(PAUZA)

    jedinstveni = {}
    for r in redovi:
        k = (r["datum"], kljuc(r["opstina"]), kljuc(r["ulica"]), r["od"], r["do"], r["brojevi"])
        jedinstveni.setdefault(k, r)
    return list(jedinstveni.values())


# ==================================================== 5. BVK KVAROVI

RX_STAVKA = re.compile(r"^(.*?)\s+(\d+[0-9a-zа-яђјљњћџ/\-]*|бб|bb)\b\s*(.*)$", re.I)


def citaj_bvk_kvarove():
    tekst = u_tekst(skini(BVK_KVAROVI))
    i = tekst.find("Без воде су потрошачи")
    if i < 0:
        print("  BVK kvarovi: nisam nasao spisak")
        return []
    kraj = min([x for x in (tekst.find("Распоред аутоцистерни", i), tekst.find("Подели садржај", i)) if x > 0]
               or [len(tekst)])
    blok = tekst[i:kraj]
    md = re.search(r"(\d{1,2}\.\d{1,2}\.\d{4})", blok)
    datum = iso_iz_tackastog(md.group(1)) if md else ""
    mdo = re.search(r"ДО\s+(\d{1,2}[:.]\d{2})", blok, re.I)
    do = sat(mdo.group(1)) if mdo else ""

    out = []
    for linija in blok.split("\n"):
        if ":" not in linija or re.match(r"^\d", linija):
            continue
        opstina, ostatak = linija.split(":", 1)
        opstina = opstina.strip()
        if len(opstina) > 30 or not u_opsegu(opstina):
            continue
        for stavka in re.split(r",\s+(?![^()]*\))", ostatak.strip()):
            stavka = stavka.strip()
            if not stavka:
                continue
            naselje = ""
            if " – " in stavka or " - " in stavka:
                stavka, naselje = re.split(r"\s[–-]\s", stavka, maxsplit=1)
            stavka = re.sub(r"\(.*?\)", "", stavka).strip()
            m = RX_STAVKA.match(stavka)
            ulica, broj = (m.group(1), m.group(2)) if m else (stavka, "")
            if not ulica:
                continue
            ul = lepo(ulica)
            out.append({
                "id": f"bvk-kvar-{datum}-{kljuc(ul).replace(' ', '-')}-{kljuc(broj)}",
                "category": "voda",
                "opstina": lepo(opstina),
                "ulica": ul,
                "brojevi": u_latinicu(broj).upper() if broj else "",
                "timeWindow": f"danas do {do}" if do else "do otklanjanja kvara",
                "datum": datum,
                "urgencyLevel": 2,
                "sourceName": "BVK - Kvarovi na mrezi",
                "rawSummary": f"Kvar na vodovodnoj mrezi: {ul} {u_latinicu(broj)} ({lepo(opstina)}"
                              f"{', ' + lepo(naselje) if naselje else ''}) - bez vode {('do ' + do) if do else 'do otklanjanja kvara'}.",
                "url": BVK_KVAROVI,
            })
    print(f"  BVK kvarovi: datum {datum or '?'}  {len(out)} stavki u opsegu")
    return out


# ==================================================== 6. BVK PLANIRANI RADOVI

RX_BLOK = re.compile(r"^(\d{1,2}\.\d{1,2}\.\d{4})\.\s+(.*)$")
RX_OPSTINA = re.compile(r"општин[иаеу]\s+([А-ЯЂЈЉЊЋЏ][а-яђјљњћџ]+(?:\s+[А-ЯЂЈЉЊЋЏ][а-яђјљњћџ]+)?)")
RX_OD_DO = re.compile(r"од\s+(\d{1,2}(?:[.:]\d{2})?)\s+до\s+(\d{1,2}(?:[.:]\d{2})?)\s*(?:сат|час|h)", re.I)


def citaj_bvk_planirane():
    tekst = u_tekst(skini(BVK_PLANIRANI))
    linije = tekst.split("\n")
    blokovi, tekuci = [], None
    for l in linije:
        m = RX_BLOK.match(l)
        if m:
            tekuci = {"datum": iso_iz_tackastog(m.group(1)), "naslov": m.group(2), "linije": []}
            blokovi.append(tekuci)
        elif tekuci is not None:
            if l.startswith(("Погледајте", "Инфо", "Info", "Traffic")):
                tekuci = None
                continue
            tekuci["linije"].append(l)

    out = []
    for b in blokovi:
        telo = " ".join(b["linije"])
        mo = RX_OPSTINA.search(b["naslov"] + " " + telo)
        opstina = ""
        if mo:
            dve = mo.group(1)
            # "Звездара Због" -> "Звездара"; "Нови Београд" ostaje
            opstina = dve if kljuc(dve) in OPSEG_K else dve.split()[0]
        if not opstina or not u_opsegu(opstina):
            continue
        mv = RX_OD_DO.search(telo)
        prozor = f"{sat(mv.group(1))}–{sat(mv.group(2))}" if mv else "tokom radova"

        ulice = []
        # a) "u ulicama:" pa nabrajanje po redovima
        if "улицама:" in telo:
            posle = False
            for l in b["linije"]:
                if "улицама:" in l:
                    posle = True
                    continue
                if posle:
                    if not re.search(r"[,.]$", l) or len(l) > 80:
                        break
                    ulice.append(l.rstrip(",."))
                    if l.endswith("."):
                        break
        # b) "u X ulici"
        for m in re.finditer(r"у\s+((?:[А-ЯЂЈЉЊЋЏ][\w-]*\s+){1,4})улици", telo):
            ulice.append(m.group(1))

        for u in ulice:
            u = re.split(r"\s+од\s+", u)[0].strip()
            if not u or len(u) < 3:
                continue
            ul = lepo(nominativ(u_latinicu(u)))
            out.append({
                "id": f"bvk-plan-{b['datum']}-{kljuc(ul).replace(' ', '-')}",
                "category": "voda",
                "opstina": lepo(opstina),
                "ulica": ul,
                "brojevi": "",
                "timeWindow": prozor,
                "datum": b["datum"],
                "isForecast": True,
                "urgencyLevel": 3,
                "sourceName": "BVK - Planirani radovi",
                "rawSummary": f"Planirani radovi BVK ({lepo(opstina)}): {ul} bez vode {prozor}.",
                "url": BVK_PLANIRANI,
            })
    print(f"  BVK planirani: {len(blokovi)} saopstenja, {len(out)} ulica u opsegu")
    return out


# ==================================================== 7. GSP IZMENE I RADOVI NA KOLOVOZU

BVK_RSS = "https://www.bvk.rs/feed/"

# Poznata opstina za glavne saobracajnice (kada izvor ne navede opstinu u tabeli)
ULICA_OPSTINA = {
    "karadjordjeva": "Savski Venac",
    "savska": "Savski Venac",
    "zemunski put": "Novi Beograd",
    "jurija gagarina": "Novi Beograd",
    "djordja stanojevica": "Novi Beograd",
    "vojvodjanska": "Novi Beograd",
    "surcinska": "Novi Beograd",
    "teodora hercla": "Zemun",
    "geteova": "Zemun",
    "banatska": "Zemun",
    "slanacki put": "Palilula",
    "milana rakica": "Zvezdara",
    "pozeska": "Cukarica",
    "marsala birjuzova": "Stari Grad",
    "stjepana filipovica": "Savski Venac",
    "kneza milosa": "Savski Venac",
    "bulevar kralja aleksandra": "Zvezdara",
    "bulevar mihajla pupina": "Novi Beograd",
    "bulevar zorana djindjica": "Novi Beograd",
    "ustanicka": "Vozdovac",
    "mirijevski bulevar": "Palilula",
    "zrenjaninski put": "Palilula",
}


_OSM_ULICA_OPSTINA_CACHE = None


def ucitaj_osm_opstine():
    global _OSM_ULICA_OPSTINA_CACHE
    if _OSM_ULICA_OPSTINA_CACHE is not None:
        return _OSM_ULICA_OPSTINA_CACHE
    _OSM_ULICA_OPSTINA_CACHE = {}
    koren = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for rel in ("public/data/ulice_beograd.json", "data/ulice_beograd.json"):
        p = os.path.join(koren, rel)
        if os.path.exists(p):
            try:
                with open(p, encoding="utf-8") as f:
                    stavke = json.load(f)
                for st in stavke:
                    if isinstance(st, list) and len(st) >= 2:
                        ku = kljuc(st[0])
                        if ku and ku not in _OSM_ULICA_OPSTINA_CACHE:
                            _OSM_ULICA_OPSTINA_CACHE[ku] = st[1]
                break
            except Exception:
                pass
    return _OSM_ULICA_OPSTINA_CACHE


def opstina_za_ulicu(ulica):
    k = kljuc(ulica)
    for ku, op in ULICA_OPSTINA.items():
        if ku == k or ku in k:
            return op
    osm_op = ucitaj_osm_opstine()
    if k in osm_op:
        return osm_op[k]
    return "Beograd"


RX_RED = re.compile(r'<tr class="(?:aktuelne|vanredne)_izmene"(.*?)</tr>', re.S)
RX_LINIJA = re.compile(r'red-voznje/smer-a/\d+"[^>]*>\s*([^<]+?)\s*</a>')
RX_TD = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
RX_PERIOD = re.compile(r"(\d{2})/(\d{2})/(\d{4})\s*-\s*(?:(\d{2})/(\d{2})/(\d{4}))?")
RX_ULICA_GSP = re.compile(
    r"(?:улиц[иае]|улицама|зони улице|Улици|Улица)\s+([А-ЯЂЈЉЊЋЏ0-9][^,.;()]*?)(?=\s+(?:и|од|у|на|код|због|током)\s|[,.;()]|$)")
RX_RADOVI = re.compile(r"(радов[аие]|реконструкц|затвара|санациј|асфалтирањ|обустав)", re.I)


def citaj_gsp():
    out = []
    radovi = []
    vidjene_ulice_radova = set()
    for vrsta, url in GSP_STRANICE:
        try:
            html = skini(url)
        except Exception as e:  # noqa: BLE001
            print(f"  GSP {vrsta}: greska - {e}")
            time.sleep(PAUZA)
            continue
        broj = 0
        for red in RX_RED.findall(html):
            linije = [u_latinicu(l).replace(" ", "").upper() for l in RX_LINIJA.findall(red)]
            celije = [re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                      for c in RX_TD.findall(red)]
            if not celije:
                continue
            naslov = celije[0]
            period = next((c for c in celije if RX_PERIOD.search(c)), "")
            mp = RX_PERIOD.search(period)
            od = f"{mp.group(3)}-{mp.group(2)}-{mp.group(1)}" if mp else ""
            do = f"{mp.group(6)}-{mp.group(5)}-{mp.group(4)}" if mp and mp.group(6) else ""
            mlink = re.search(r'href="(https://www\.bgprevoz\.rs/linije/(?:aktuelne|vanredne)-izmene/\d+)"', red)
            ulice = [lepo(nominativ(u_latinicu(re.split(r"\s+(?:–|-|до|према|од)\s+", m.group(1))[0])))
                     for m in RX_ULICA_GSP.finditer(naslov)]
            ulica = ulice[0] if ulice else ""
            if not linije:
                continue
            opstina = opstina_za_ulicu(ulica) if ulica else "Beograd"
            prozor = (f"{od[8:10]}.{od[5:7]}. – {do[8:10]}.{do[5:7]}." if od and do
                      else f"od {od[8:10]}.{od[5:7]}., do daljnjeg" if od else "aktuelno")
            stavka_id = mlink.group(1).rsplit('/', 1)[1] if mlink else str(broj)
            stavka_url = mlink.group(1) if mlink else url
            out.append({
                "id": f"gsp-{vrsta}-{stavka_id}",
                "category": "prevoz",
                "opstina": opstina,
                "ulica": ulica or "više lokacija",
                "brojevi": "",
                "timeWindow": prozor,
                "transitLines": linije,
                "vaziOd": od,
                "vaziDo": do,
                "urgencyLevel": 1 if vrsta == "vanredne" else 2,
                "sourceName": f"Sekretarijat za javni prevoz ({vrsta} izmene)",
                "rawSummary": u_latinicu(naslov) + f" Linije: {', '.join(linije)}.",
                "url": stavka_url,
            })
            # Ako izmena nosi radove na kolovozu u konkretnoj ulici, izdvoji i stavku "radovi" za vozace automobila
            if ulica and RX_RADOVI.search(naslov):
                ku = kljuc(ulica)
                if ku not in vidjene_ulice_radova:
                    vidjene_ulice_radova.add(ku)
                    radovi.append({
                        "id": f"radovi-kolovoz-{stavka_id}",
                        "category": "radovi",
                        "opstina": opstina,
                        "ulica": ulica,
                        "brojevi": "",
                        "timeWindow": prozor,
                        "vaziOd": od,
                        "vaziDo": do,
                        "urgencyLevel": 1 if vrsta == "vanredne" else 2,
                        "sourceName": "Sekretarijat za saobraćaj / Beoinfo (Radovi)",
                        "rawSummary": f"{u_latinicu(naslov)} (izmena režima saobraćaja na kolovozu, {prozor}).",
                        "url": stavka_url,
                    })
            broj += 1
        print(f"  GSP {vrsta}: {broj} izmena")
        time.sleep(PAUZA)
    return out, radovi


def citaj_bvk_saobracaj():
    """Izvlaci hitne saobracajne obustave zbog radova na mrezi iz zvanicnog BVK RSS fida."""
    xml = skini(BVK_RSS)
    out = []
    for item in re.findall(r"<item>(.*?)</item>", xml, re.S):
        naslov_m = re.search(r"<title>(.*?)</title>", item, re.S)
        link_m = re.search(r"<link>(.*?)</link>", item, re.S)
        sadrzaj_m = (
            re.search(r"<content:encoded><!\[CDATA\[(.*?)\]\]></content:encoded>", item, re.S)
            or re.search(r"<description><!\[CDATA\[(.*?)\]\]></description>", item, re.S)
        )
        naslov = htmlmod.unescape(naslov_m.group(1)).strip() if naslov_m else ""
        sadrzaj = u_tekst(sadrzaj_m.group(1)) if sadrzaj_m else ""
        ceo = f"{naslov}\n{sadrzaj}"
        if not re.search(r"за саобраћај се|затвара се саобраћај|обустава саобраћаја|санациј[ае] дефекта", ceo, re.I):
            continue
        mu = re.search(r"у\s+((?:[А-ЯЂЈЉЊЋЏ][\w-]*\s+){1,3})улици", ceo) or RX_ULICA_GSP.search(ceo)
        ulica = lepo(nominativ(u_latinicu(re.split(r"\s+(?:–|-|до|према|од)\s+", mu.group(1))[0]))) if mu else ""
        if not ulica:
            continue
        opstina = opstina_za_ulicu(ulica)
        md = re.search(r"(\d{1,2}\.\d{1,2}\.\d{4})", ceo)
        datum = iso_iz_tackastog(md.group(1)) if md else ""
        out.append({
            "id": f"radovi-bvk-{datum or 'aktuelno'}-{kljuc(ulica).replace(' ', '-')}",
            "category": "radovi",
            "opstina": opstina,
            "ulica": ulica,
            "brojevi": "",
            "timeWindow": f"od {md.group(1)}." if md else "hitni radovi u toku",
            "datum": datum,
            "urgencyLevel": 1,
            "sourceName": "BVK / Sekretarijat za saobraćaj (Obustava)",
            "rawSummary": f"{u_latinicu(naslov)} — zatvaranje kolovoza za saobraćaj u zoni radova ({ulica}).",
            "url": link_m.group(1).strip() if link_m else BVK_KVAROVI,
        })
    print(f"  BVK saobracajne obustave: {len(out)} stavki")
    return out


# ==================================================== 7B. SEKRETARIJAT ZA SAOBRACAJ I PUTEVI SRBIJE (RADOVI)

BGSAOBRACAJ_STRANICE = [
    "https://bgsaobracaj.rs/vesti",
    "https://bgsaobracaj.rs/sekretarijat/sektor-za-puteve/16/odeljenje-za-privremeni-rezim-saobraca%D1%98a",
]

PUTEVI_SRBIJE_URL = "https://www.putevi-srbije.rs/index.php/sr/stanje-na-drzavnim-putevima"

# Koridori drzavnih puteva na teritoriji Beograda sa tacnim koordinatama (u latinici radi poredjenja posle u_latinicu)
BEOGRAD_DRZAVNI_PUTEVI = [
    (re.compile(r"Mostarska petlja\s*[-–]\s*Konjarnik|Mostar.*Konjarnik|Autokomand", re.I),
     "Moto-put M11 (Mostar – Konjarnik)", "Savski venac", 44.7895, 20.4642),
    (re.compile(r"petlja Beograd\s*[-–]\s*petlja Zmaj|Beograd.*Zmaj", re.I),
     "Moto-put M11 (Dobanovci – Zmaj)", "Zemun", 44.8350, 20.3620),
    (re.compile(r"petlja Batajnica\s*[-–]\s*petlja Beograd|petlja Batajnica", re.I),
     "Auto-put A1 (petlja Batajnica)", "Zemun", 44.8920, 20.3110),
    (re.compile(r"Ostru[zž]ni[cč]ki most|Sur[cč]in.*Ostru[zž]nica|Obilaznica oko Beograda", re.I),
     "Obilaznica oko Beograda (Ostružnički most)", "Čukarica", 44.7490, 20.3140),
    (re.compile(r"Aerodrom.*Nikola Tesla|petlja Aerodrom", re.I),
     "Moto-put M12 (prilaz Aerodromu Nikola Tesla)", "Surčin", 44.8155, 20.3065),
    (re.compile(r"Umka\s*[-–]\s*Bari[cč]", re.I),
     "Obrenovački put (Umka – Barič)", "Čukarica", 44.6680, 20.2850),
    (re.compile(r"Ritopek\s*[-–]\s*Grocka|Smederevski put", re.I),
     "Smederevski put (Ritopek – Grocka)", "Grocka", 44.6850, 20.6620),
    (re.compile(r"Pan[cč]eva[cč]ki most", re.I),
     "Pančevački most", "Palilula", 44.8282, 20.4856),
]


def sredi_ulicu_bgsaobracaj(sirovo: str) -> str:
    """Pretvara naslov ili izraz iz Sekretarijata za saobracaj u cist naziv prve ulice u nominativu."""
    s = u_latinicu(sirovo or "").strip()
    s = re.sub(
        r"^(?:u\s+|na\s+)?(?:zoni\s+)?(?:raskrsnic[ie]\s+|uglu\s+|petlji\s+)?(?:ulica\s+|ul\.?\s+|ulici\s+)?",
        "",
        s,
        flags=re.I,
    ).strip()
    s = re.split(r"\s+(?:na delu|u zoni|u Beogradu|kod|zbog|od\s|do\s|\()", s, maxsplit=1, flags=re.I)[0].strip()
    # Ako je navedeno vise ulica ili raskrsnica ("Zemunski put, Sajmiste i ...", "Velimira Bate Zivojinovica, Vracar"), uzmi prvu ulicu
    s = re.split(r"\s*(?:,|\s+i\s+|\s+-\s+|\s+–\s+)\s*", s, maxsplit=1, flags=re.I)[0].strip()
    s = re.sub(r"^(?:u\s+ul\.?\s+|u\s+ulici\s+|ul\.?\s+|ulici\s+|u\s+)", "", s, flags=re.I).strip()
    s = s.strip("„“\"'.,:; ")
    if re.match(r"^bulevaru\b", s, flags=re.I):
        s = "Bulevar" + s[8:]
    elif re.match(r"^trgu\b", s, flags=re.I):
        s = "Trg" + s[4:]
    else:
        s = nominativ(s)
    return lepo(s)


def citaj_bgsaobracaj_radove():
    """Cita zvanicne obustave i izmene rezima saobracaja sa bgsaobracaj.rs."""
    sada_dt = datetime.now(BEOGRAD)
    danas_iso = sada_dt.strftime("%Y-%m-%d")
    out = []
    vidjeno = set()

    for url in BGSAOBRACAJ_STRANICE:
        try:
            tekst = u_tekst(skini_browser(url))
        except Exception as e:  # noqa: BLE001
            print(f"  bgsaobracaj ({url.rsplit('/', 1)[-1]}): greska - {e}")
            continue

        linije = [l.strip() for l in tekst.split("\n") if l.strip()]
        for i, l in enumerate(linije):
            # Trazi liniju datuma objave oblika DD/MM/YYYY
            m_pub = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", l)
            if not m_pub:
                continue
            pd, pm, pg = int(m_pub.group(1)), int(m_pub.group(2)), int(m_pub.group(3))
            try:
                pub_dt = datetime(pg, pm, pd, tzinfo=BEOGRAD)
            except ValueError:
                continue
            starost_dana = (sada_dt - pub_dt).days

            naslov = linije[i - 1] if i > 0 else ""
            opis = " ".join(linije[i + 1:min(len(linije), i + 5)])
            opis = re.sub(r"^Одељење за привремени режим саобраћаја\s*", "", opis, flags=re.I).strip()
            if not re.search(r"саобраћај|радов|обустав|затвара", naslov + " " + opis, re.I):
                continue

            # Izvuci ulicu iz naslova ("Обустава саобраћаја у ул. X") ili iz opisa
            m_naslov = re.search(
                r"(?:Обустава саобраћаја|Измена режима(?:\s+и\s+обустава)?\s+саобраћаја|Радови|Затварање саобраћаја)\s+(?:у|на)\s+(.+)$",
                naslov,
                re.I,
            )
            ulica = ""
            if m_naslov:
                ulica = sredi_ulicu_bgsaobracaj(m_naslov.group(1))
            if not ulica or len(ulica) < 3:
                m_opis = re.search(
                    r"(?:ул\.|улици|Улици|Булевару|булевару)\s+([А-ЯЂЈЉЊЋЏ][^,.;()]{2,45})",
                    opis,
                )
                if m_opis:
                    ulica = sredi_ulicu_bgsaobracaj(m_opis.group(1))
            if not ulica or len(ulica) < 3:
                continue

            # Izvuci period vazenja: "од DD.MM.(YYYY.)? до DD.MM.YYYY." ili "дана DD.MM.YYYY."
            m_per = re.search(
                r"(?:од|у временском периоду)\s+(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4})\.?)?\s*(?:до|-|–)\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})",
                opis,
                re.I,
            )
            od_iso, do_iso, prozor = "", "", ""
            if m_per:
                d1, m1, g1, d2, m2, g2 = m_per.groups()
                if not g1:
                    g1 = str(int(g2) - 1) if int(m1) > int(m2) else g2
                od_iso = f"{int(g1):04d}-{int(m1):02d}-{int(d1):02d}"
                do_iso = f"{int(g2):04d}-{int(m2):02d}-{int(d2):02d}"
                prozor = f"{int(d1):02d}.{int(m1):02d}. – {int(d2):02d}.{int(m2):02d}."
            else:
                m_dan = re.search(r"дана\s*:?\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?", opis, re.I)
                if m_dan:
                    d1, m1, g1 = m_dan.groups()
                    g1 = g1 or str(pg)
                    od_iso = do_iso = f"{int(g1):04d}-{int(m1):02d}-{int(d1):02d}"
                    prozor = f"{int(d1):02d}.{int(m1):02d}."

            # Preskoci radove koji su vec zavrseni pre danasnjeg dana
            if do_iso and do_iso < danas_iso:
                continue

            # Ako krajnji datum nije naveden u kratkom izvodu, zadrzi samo sveze objave iz poslednjih 12 dana
            if not do_iso:
                if starost_dana > 12:
                    continue
                prozor = f"od {pd:02d}.{pm:02d}."

            ku = kljuc(ulica)
            if not ku or ku in vidjeno:
                continue
            vidjeno.add(ku)

            # Proveri da li je opstina navedena u zagradama ili iza zareza u naslovu
            m_op = re.search(r"\(([А-ЯЂЈЉЊЋЏа-яђјљњћџ\s]{4,20})\)", naslov + " " + opis)
            opstina = ""
            if m_op and u_opsegu(m_op.group(1)):
                opstina = lepo(m_op.group(1))
            if not opstina and "," in naslov:
                kandidat_op = naslov.rsplit(",", 1)[-1].strip()
                if u_opsegu(kandidat_op):
                    opstina = lepo(kandidat_op)
            if not opstina:
                opstina = opstina_za_ulicu(ulica)

            kratak_opis = u_latinicu(opis)
            if len(kratak_opis) > 220:
                kratak_opis = kratak_opis[:217].rsplit(" ", 1)[0] + "..."

            out.append({
                "id": f"radovi-bgsaobracaj-{ku.replace(' ', '-')}",
                "category": "radovi",
                "opstina": opstina,
                "ulica": ulica,
                "brojevi": "",
                "timeWindow": prozor,
                "vaziOd": od_iso,
                "vaziDo": do_iso,
                "urgencyLevel": 1 if "обустав" in naslov.lower() or "затворе" in opis.lower() else 2,
                "sourceName": "Sekretarijat za saobraćaj Grada Beograda",
                "rawSummary": f"{u_latinicu(naslov)} ({prozor}): {kratak_opis}",
                "url": url,
            })

    print(f"  Sekretarijat za saobracaj (bgsaobracaj.rs): {len(out)} aktivnih radova")
    return out


def citaj_puteve_srbije_beograd():
    """Cita aktuelne radove na drzavnim putevima i obilaznici u zoni Beograda sa putevi-srbije.rs."""
    tekst = u_latinicu(u_tekst(skini_browser(PUTEVI_SRBIJE_URL)))
    out = []
    vidjeno = set()

    for linija in tekst.split("\n"):
        pasus_cist = re.sub(r"\s+", " ", linija).strip()
        if len(pasus_cist) < 25 or len(pasus_cist) > 1600:
            continue
        for rx, naziv_koridora, opstina, lat, lng in BEOGRAD_DRZAVNI_PUTEVI:
            if rx.search(pasus_cist):
                k = kljuc(naziv_koridora)
                if k in vidjeno:
                    break
                vidjeno.add(k)
                md = re.search(r"do\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})", pasus_cist, re.I)
                prozor = f"do {md.group(1).replace(' ', '')[:6]}" if md else "aktuelni radovi"
                kratak = pasus_cist.lstrip("-–•* ").strip()
                if len(kratak) > 220:
                    kratak = kratak[:217].rsplit(" ", 1)[0] + "..."
                out.append({
                    "id": f"radovi-putevi-srbije-{k.replace(' ', '-')}",
                    "category": "radovi",
                    "opstina": opstina,
                    "ulica": naziv_koridora,
                    "brojevi": "",
                    "timeWindow": prozor,
                    "urgencyLevel": 2,
                    "lat": lat,
                    "lng": lng,
                    "sourceName": "JP Putevi Srbije (Stanje na putevima)",
                    "rawSummary": kratak,
                    "url": PUTEVI_SRBIJE_URL,
                })
                break

    print(f"  JP Putevi Srbije (Beograd): {len(out)} deonica pod radovima")
    return out


# ==================================================== 7C. JKP PARKING SERVIS - SLOBODNA MESTA UZIVO

PARKING_URL_LAT = "https://www.parking-servis.co.rs/lat/garaze-i-parkiralista"
PARKING_URL_CIR = "https://www.parking-servis.co.rs/garaze-i-parkiralista"

# Tacna mapa svih 27 javnih garaza i parkiralista u Beogradu (ključ -> (ulica, opstina, lat, lng))
PARKING_LOKACIJE = {
    "baba visnjina": ("Baba Višnjina", "Vračar", 44.7995, 20.4742),
    "botanicka basta": ("Vojvode Dobrnjca", "Palilula", 44.8152, 20.4754),
    "dr aleksandra kostica": ("Dr Aleksandra Kostića", "Savski venac", 44.8058, 20.4593),
    "masarikova": ("Masarikova", "Vračar", 44.8053, 20.4631),
    "obilicev venac": ("Obilićev venac", "Stari grad", 44.8162, 20.4563),
    "pinki": ("Gradski park (Hala Pinki)", "Zemun", 44.8415, 20.4087),
    "pionirski park": ("Bulevar kralja Aleksandra (Pionirski park)", "Stari grad", 44.8114, 20.4636),
    "vukov spomenik": ("Kraljice Marije (Vukov spomenik)", "Zvezdara", 44.8051, 20.4776),
    "zeleni venac": ("Kraljice Natalije (Zeleni venac)", "Stari grad", 44.8140, 20.4578),
    "ada": ("Radnička (Ada Ciganlija)", "Čukarica", 44.7890, 20.4150),
    "ada ciganlija": ("Radnička (Ada Ciganlija)", "Čukarica", 44.7890, 20.4150),
    "belvil": ("Jurija Gagarina (Belvil)", "Novi Beograd", 44.8058, 20.4052),
    "bezanijska kosa": ("Partizanske avijacije", "Novi Beograd", 44.8235, 20.3765),
    "blok 43": ("Antifašističke borbe (Blok 43)", "Novi Beograd", 44.8075, 20.4165),
    "cukarica": ("Šumadijski trg", "Čukarica", 44.7825, 20.4182),
    "cvetkova pijaca": ("Živka Davidovića (Cvetkova pijaca)", "Zvezdara", 44.7924, 20.5048),
    "donji grad": ("Bulevar vojvode Bojovića (Donji grad)", "Stari grad", 44.8266, 20.4525),
    "kalemegdan": ("Mali Kalemegdan", "Stari grad", 44.8236, 20.4547),
    "kamenicka": ("Kamenička", "Savski venac", 44.8116, 20.4557),
    "ljermontova": ("Ljermontova", "Voždovac", 44.7834, 20.4892),
    "medjunarodni carinski terminal": ("Auto-put za Zagreb (Carinski terminal)", "Novi Beograd", 44.8260, 20.3690),
    "milan gale muskatirovic": ("Tadeuša Košćuška (25. maj)", "Stari grad", 44.8295, 20.4585),
    "opstina nbgd": ("Bulevar Mihajla Pupina (Opština NBG)", "Novi Beograd", 44.8208, 20.4146),
    "opstina novi beograd": ("Bulevar Mihajla Pupina (Opština NBG)", "Novi Beograd", 44.8208, 20.4146),
    "politika": ("Makedonska (Politika)", "Stari grad", 44.8155, 20.4638),
    "slavija": ("Prote Mateje (Slavija)", "Vračar", 44.8031, 20.4673),
    "vidin kapija": ("Bulevar vojvode Bojovića (Vidin kapija)", "Stari grad", 44.8262, 20.4558),
    "viska": ("Viška (Kalenić pijaca)", "Vračar", 44.7998, 20.4785),
    "vma": ("Crnotravska (VMA)", "Savski venac", 44.7645, 20.4552),
}


def citaj_parking():
    """Cita trenutan broj slobodnih mesta u javnim garazama i parkiralistima JKP Parking servis."""
    html = ""
    poslednja_greska = None
    for url in (PARKING_URL_LAT, PARKING_URL_CIR):
        try:
            html = skini_browser(url)
            if html and ("Gara" in html or "Гара" in html or "Obili" in html or "Обили" in html):
                break
        except Exception as exc:  # noqa: BLE001
            poslednja_greska = exc
            continue
    if not html:
        raise RuntimeError(f"Parking servis sajt nije dostupan ({poslednja_greska})")

    tekst = u_latinicu(u_tekst(html))
    # Trazi parove: Garaža „Obilićev venac” [razmak ili novi red] 103
    rx_par = re.compile(
        r"(Gara[zž]a|Parkirali[sš]te)\s*[„\"“'«»]?\s*([^”\"”'\n<>]{2,45}?)\s*[”\"”'«»]?[\s#*_\-:]*?(\d{1,4})\b",
        re.I,
    )
    out = []
    vidjeno = set()
    for m in rx_par.finditer(tekst):
        tip_raw, ime_raw, slobodna_str = m.groups()
        ime = ime_raw.strip(" „“\"'.,:-")
        k_ime = kljuc(ime)
        if not k_ime or k_ime in vidjeno:
            continue
        vidjeno.add(k_ime)

        slobodna = int(slobodna_str)
        tip = "Garaža" if tip_raw.lower().startswith("gara") else "Parkiralište"
        info = PARKING_LOKACIJE.get(k_ime)
        if not info:
            # Pokusaj delimicno poklapanje
            for k_lok, v_lok in PARKING_LOKACIJE.items():
                if k_lok in k_ime or k_ime in k_lok:
                    info = v_lok
                    break

        if info:
            ulica, opstina, lat, lng = info
        else:
            ulica, opstina, lat, lng = ime, "Beograd", None, None

        if slobodna == 0:
            hitnost = 1
            opis = f"{tip} „{ime}“ ({ulica}) je trenutno popunjena — nema slobodnih mesta."
            prozor = "Popunjeno (0 mesta)"
        elif slobodna <= 15:
            hitnost = 1
            opis = f"{tip} „{ime}“ ({ulica}) je skoro popunjena — preostalo je još {slobodna} slobodnih mesta."
            prozor = f"Uživo: {slobodna} slobodnih mesta"
        else:
            hitnost = 2 if slobodna <= 50 else 3
            opis = f"{tip} „{ime}“ ({ulica}) trenutno ima {slobodna} slobodnih mesta."
            prozor = f"Uživo: {slobodna} slobodnih mesta"

        stavka = {
            "id": f"parking-{k_ime.replace(' ', '-')}",
            "category": "garaza",
            "opstina": opstina,
            "ulica": ulica,
            "brojevi": str(slobodna),
            "timeWindow": prozor,
            "urgencyLevel": hitnost,
            "sourceName": "JKP Parking servis Beograd (uživo)",
            "rawSummary": opis,
            "url": PARKING_URL_LAT,
        }
        if lat is not None and lng is not None:
            stavka["lat"] = lat
            stavka["lng"] = lng
        out.append(stavka)

    print(f"  JKP Parking servis: {len(out)} garaza i parkiralista sa slobodnim mestima uzivo")
    return out


# ==================================================== 8. RECNIK (samo citanje, za izvestaj)

def poznate_ulice():
    """Cita nazive iz recnik_nazivi.json, ulice_beograd.json ili recnik.csv ako su dostupni (samo citanje)."""
    tu = os.path.dirname(os.path.abspath(__file__))
    koren = os.path.dirname(tu)
    skup = set()
    for p in (
        os.path.join(tu, "recnik_nazivi.json"),
        os.path.join(koren, "public", "data", "ulice_beograd.json"),
        os.path.join(koren, "data", "ulice_beograd.json"),
        "recnik.csv",
    ):
        if os.path.exists(p):
            try:
                if p.endswith("ulice_beograd.json"):
                    with open(p, encoding="utf-8") as f:
                        for st in json.load(f):
                            if isinstance(st, list) and st:
                                skup.add(kljuc(st[0]))
                elif p.endswith(".json"):
                    with open(p, encoding="utf-8") as f:
                        skup.update(kljuc(x) for x in json.load(f))
                else:
                    import csv
                    with open(p, encoding="utf-8-sig", newline="") as f:
                        skup.update(kljuc(r["naziv"]) for r in csv.DictReader(f))
            except Exception:
                pass
    return skup if skup else None


# ==================================================== 9. GLAVNI TOK

def bezbedno(ime, fn):
    try:
        return fn(), {"ok": True}
    except Exception as e:  # noqa: BLE001
        print(f"  {ime}: GRESKA - {e}")
        return [], {"ok": False, "greska": str(e)[:200]}


def main():
    izlaz = sys.argv[1] if len(sys.argv) > 1 else "data/servisi.json"
    print("\n  Osvezavanje servisnih izvora\n")

    eds, s_eds = bezbedno("EDS", citaj_eds)
    kvarovi, s_kv = bezbedno("BVK kvarovi", citaj_bvk_kvarove)
    time.sleep(PAUZA)
    planirani, s_pl = bezbedno("BVK planirani", citaj_bvk_planirane)
    time.sleep(PAUZA)
    gsp_res, s_gsp = bezbedno("GSP", citaj_gsp)
    if isinstance(gsp_res, tuple):
        gsp, gsp_radovi = gsp_res
    else:
        gsp, gsp_radovi = gsp_res, []
    time.sleep(PAUZA)
    bvk_radovi, s_rad_bvk = bezbedno("BVK saobracaj", citaj_bvk_saobracaj)
    time.sleep(PAUZA)
    bgs_radovi, s_rad_bgs = bezbedno("Sekretarijat za saobracaj", citaj_bgsaobracaj_radove)
    time.sleep(PAUZA)
    ps_radovi, s_rad_ps = bezbedno("JP Putevi Srbije", citaj_puteve_srbije_beograd)
    time.sleep(PAUZA)
    parking, s_park = bezbedno("JKP Parking servis", citaj_parking)

    # Spoji radove na putu bez dupliranja iste ulice
    radovi = []
    vidjene_ulice_radova = set()
    for st in bgs_radovi + ps_radovi + bvk_radovi + gsp_radovi:
        ku = kljuc(st.get("ulica", ""))
        if ku and ku in vidjene_ulice_radova:
            continue
        if ku:
            vidjene_ulice_radova.add(ku)
        radovi.append(st)

    s_rad = {"ok": bool(s_rad_bgs["ok"] or s_rad_ps["ok"] or s_rad_bvk["ok"] or gsp_radovi)}

    # Ako je izvor pao, zadrzi poslednje dobre podatke tog izvora iz prethodnog fajla.
    stari = {}
    if os.path.exists(izlaz):
        try:
            with open(izlaz, encoding="utf-8") as f:
                stari = json.load(f)
        except Exception:  # noqa: BLE001
            stari = {}
    if not s_eds["ok"] and stari.get("eds"):
        eds = stari["eds"]
    stari_dir = stari.get("direktni", [])
    if not s_kv["ok"]:
        kvarovi = [r for r in stari_dir if r.get("sourceName", "").startswith("BVK - Kvarovi")]
    if not s_pl["ok"]:
        planirani = [r for r in stari_dir if r.get("sourceName", "").startswith("BVK - Planirani")]
    if not s_gsp["ok"]:
        gsp = [r for r in stari_dir if r.get("category") == "prevoz"]
    if not s_rad["ok"] and not radovi:
        radovi = [r for r in stari_dir if r.get("category") == "radovi"]
    if not s_park["ok"]:
        parking = [r for r in stari_dir if r.get("category") == "garaza"]

    direktni = kvarovi + planirani + gsp + radovi + parking

    recnik = poznate_ulice()
    nepoznate = []
    if recnik is not None:
        nepoznate = sorted({r["ulica"] for r in eds + direktni
                            if r.get("ulica") and r.get("category") != "garaza" and kljuc(r["ulica"]) not in recnik})

    podaci = {
        "verzija": 1,
        "generisano": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "izvori": {
            "eds": dict(s_eds, broj=len(eds)),
            "bvk_kvarovi": dict(s_kv, broj=len(kvarovi)),
            "bvk_planirani": dict(s_pl, broj=len(planirani)),
            "gsp": dict(s_gsp, broj=len(gsp)),
            "radovi": dict(s_rad, broj=len(radovi)),
            "parking": dict(s_park, broj=len(parking)),
        },
        "eds": sorted(eds, key=lambda r: (r["datum"], r["opstina"], r["od"], r["ulica"])),
        "direktni": direktni,
        "nepoznate_ulice": nepoznate,
    }

    # Ne prepisuj fajl ako se sadrzaj nije promenio (osim vremena) - manje commitova.
    if stari:
        uporedi = {k: v for k, v in podaci.items() if k != "generisano"}
        staro = {k: v for k, v in stari.items() if k != "generisano"}
        if uporedi == staro:
            print("\n  Nema promena u izvorima.\n")
            return

    os.makedirs(os.path.dirname(izlaz) or ".", exist_ok=True)
    with open(izlaz, "w", encoding="utf-8") as f:
        json.dump(podaci, f, ensure_ascii=False, indent=1)

    print(
        f"\n  EDS: {len(eds)}  BVK kvarovi: {len(kvarovi)}  BVK planirani: {len(planirani)}"
        f"  GSP: {len(gsp)}  Radovi: {len(radovi)}  Parking: {len(parking)}"
    )
    print(f"  Ulica van recnika: {len(nepoznate)}")
    print(f"  Zapisano: {izlaz}\n")


if __name__ == "__main__":
    main()

