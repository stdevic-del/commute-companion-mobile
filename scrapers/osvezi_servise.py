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
    s = re.sub(r"\bbul\b\.?\s*", "bulevar ", s)
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

def skini(url):
    ua = APLIKACIJA
    kontakt = os.environ.get("KONTAKT", "").strip()
    if kontakt:
        ua = f"{APLIKACIJA[:-1]}; {kontakt})"
    zahtev = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(zahtev, timeout=40) as o:
        sirovo = o.read()
    for kod in ("utf-8-sig", "cp1251", "latin-1"):
        try:
            return sirovo.decode(kod)
        except UnicodeDecodeError:
            continue
    return sirovo.decode("utf-8", errors="replace")


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


def opstina_za_ulicu(ulica):
    k = kljuc(ulica)
    for ku, op in ULICA_OPSTINA.items():
        if ku == k or ku in k:
            return op
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


# ==================================================== 8. RECNIK (samo citanje, za izvestaj)

def poznate_ulice():
    """Cita nazive iz recnik.csv ako je dostupan (samo citanje)."""
    tu = os.path.dirname(os.path.abspath(__file__))
    for p in (os.path.join(tu, "recnik_nazivi.json"), "recnik.csv"):
        if os.path.exists(p):
            if p.endswith(".json"):
                with open(p, encoding="utf-8") as f:
                    return {kljuc(x) for x in json.load(f)}
            import csv
            with open(p, encoding="utf-8-sig", newline="") as f:
                return {kljuc(r["naziv"]) for r in csv.DictReader(f)}
    return None


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
    bvk_radovi, s_rad = bezbedno("BVK saobracaj", citaj_bvk_saobracaj)
    radovi = bvk_radovi + gsp_radovi

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
    if not s_rad["ok"] and not gsp_radovi:
        radovi = [r for r in stari_dir if r.get("category") == "radovi"]

    direktni = kvarovi + planirani + gsp + radovi

    recnik = poznate_ulice()
    nepoznate = []
    if recnik is not None:
        nepoznate = sorted({r["ulica"] for r in eds + direktni
                            if r.get("ulica") and kljuc(r["ulica"]) not in recnik})

    podaci = {
        "verzija": 1,
        "generisano": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "izvori": {
            "eds": dict(s_eds, broj=len(eds)),
            "bvk_kvarovi": dict(s_kv, broj=len(kvarovi)),
            "bvk_planirani": dict(s_pl, broj=len(planirani)),
            "gsp": dict(s_gsp, broj=len(gsp)),
            "radovi": dict(s_rad, broj=len(radovi)),
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

    print(f"\n  EDS: {len(eds)}  BVK kvarovi: {len(kvarovi)}  BVK planirani: {len(planirani)}  GSP: {len(gsp)}  Radovi: {len(radovi)}")
    print(f"  Ulica van recnika: {len(nepoznate)}")
    print(f"  Zapisano: {izlaz}\n")


if __name__ == "__main__":
    main()
