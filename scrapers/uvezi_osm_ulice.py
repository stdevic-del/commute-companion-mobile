#!/usr/bin/env python3
"""
Jednokratni / periodični uvoz svih beogradskih ulica iz OpenStreetMap-a preko Overpass API-ja.
Ne koristi Nominatim (poštuje zabranu geokodiranja kroz Nominatim), već preuzima
vektorske segmente ulica (highway + name) za ceo Beograd u jednom Overpass upitu,
računa tačnu dužinu svake ulice u metrima (Haversine po čvorovima), središnju tačku (lat, lon)
i opštinu, pa snima:
  1) public/data/ulice_beograd.json — kompaktan spisak [naziv, opstina, lat, lon, duzinaM]
  2) scrapers/recnik_nazivi.json    — prošireni spisak normalizovanih ključeva za osvezi_servise.py
"""

import json
import math
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Okvir grada Beograda (svih 17 opština uključujući Obrenovac, Lazarevac, Mladenovac, Grocku, Surčin, Zemun)
BEOGRAD_BBOX = (44.36, 20.08, 45.02, 20.75)

# Centri i okvirni radijusi 17 beogradskih opština za brzo određivanje opštine kada OSM tag nije naveden
OPSTINE_CENTRI = [
    ("Stari grad", 44.8186, 20.4581, 1.0),
    ("Vračar", 44.7989, 20.4765, 1.0),
    ("Savski venac", 44.7945, 20.4480, 1.1),
    ("Novi Beograd", 44.8150, 20.4020, 1.25),
    ("Zvezdara", 44.7930, 20.5080, 1.25),
    ("Palilula", 44.8350, 20.5050, 1.45),
    ("Voždovac", 44.7650, 20.4850, 1.35),
    ("Čukarica", 44.7560, 20.4050, 1.35),
    ("Rakovica", 44.7420, 20.4420, 1.20),
    ("Zemun", 44.8550, 20.3650, 1.35),
    ("Surčin", 44.7950, 20.2650, 1.50),
    ("Grocka", 44.6750, 20.6800, 1.50),
    ("Obrenovac", 44.6550, 20.1950, 1.50),
    ("Barajevo", 44.5750, 20.4150, 1.50),
    ("Sopot", 44.5200, 20.5750, 1.50),
    ("Mladenovac", 44.4360, 20.6950, 1.50),
    ("Lazarevac", 44.3820, 20.2620, 1.50),
]

# Preslovljavanje ćirilice u srpsku latinicu sa dijakriticima (za prikaz u aplikaciji)
CIR_U_LAT_DIJAKRITICI = {
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Ђ": "Đ",
    "Е": "E", "Ж": "Ž", "З": "Z", "И": "I", "Ј": "J", "К": "K",
    "Л": "L", "Љ": "Lj", "М": "M", "Н": "N", "Њ": "Nj", "О": "O",
    "П": "P", "Р": "R", "С": "S", "Т": "T", "Ћ": "Ć", "У": "U",
    "Ф": "F", "Х": "H", "Ц": "C", "Ч": "Č", "Џ": "Dž", "Ш": "Š",
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "đ",
    "е": "e", "ж": "ž", "з": "z", "и": "i", "ј": "j", "к": "k",
    "л": "l", "љ": "lj", "м": "m", "н": "n", "њ": "nj", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "ћ": "ć", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "č", "џ": "dž", "ш": "š",
}

# Preslovljavanje u ASCII ključ bez dijakritika (za poređenje i recnik_nazivi.json)
CIR_U_ASCII = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "dj",
    "е": "e", "ж": "z", "з": "z", "и": "i", "ј": "j", "к": "k",
    "л": "l", "љ": "lj", "м": "m", "н": "n", "њ": "nj", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "ћ": "c", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "c", "џ": "dz", "ш": "s",
}


def u_latinicu(tekst: str) -> str:
    return "".join(CIR_U_LAT_DIJAKRITICI.get(ch, ch) for ch in (tekst or "")).strip()


def kljuc(s: str) -> str:
    s = (s or "").lower()
    s = "".join(CIR_U_ASCII.get(c, c) for c in s)
    s = (
        s.replace("đ", "dj")
        .replace("č", "c")
        .replace("ć", "c")
        .replace("š", "s")
        .replace("ž", "z")
    )
    s = re.sub(r"(?<=\w)-(?=\w)", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def odredi_opstinu(lat: float, lon: float, tags: dict) -> str:
    for tag_key in ("addr:district", "addr:municipality", "is_in:municipality", "addr:suburb"):
        v = tags.get(tag_key)
        if v:
            lat_v = u_latinicu(v).replace("Gradska opština ", "").replace("Opština ", "").strip()
            if lat_v:
                return lat_v

    najbliza = "Beograd"
    min_score = 1e18
    for naziv, clat, clon, faktor in OPSTINE_CENTRI:
        d = haversine_m(lat, lon, clat, clon) / faktor
        if d < min_score:
            min_score = d
            najbliza = naziv
    return najbliza


def preuzmi_overpass_ulice() -> dict:
    s, w, n, e = BEOGRAD_BBOX
    query = f"""
[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|road)$"]["name"]({s},{w},{n},{e});
);
out body geom qt;
""".strip()

    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    poslednja_greska = None

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            print(f"[OSM] Preuzimam ulice Beograda sa {endpoint} ...")
            req = urllib.request.Request(
                endpoint,
                data=body,
                headers={
                    "User-Agent": "CommuteCompanionBG-OSM-Importer/1.0 (https://github.com/stdevic-del/commute-companion)",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                },
            )
            with urllib.request.urlopen(req, timeout=130) as resp:
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
                if "elements" in data and len(data["elements"]) > 100:
                    print(f"[OSM] Uspešno preuzeto {len(data['elements'])} segmenata ulica.")
                    return data
        except Exception as exc:
            poslednja_greska = exc
            print(f"[OSM] Upozorenje za {endpoint}: {exc}")

    raise RuntimeError(f"Neuspešno preuzimanje sa Overpass API-ja: {poslednja_greska}")


def obradi_elemente(elements: list) -> tuple[list, list]:
    """
    Grupiše segmente ulica po normalizovanom nazivu i prostornoj bliskosti (do 3.5 km),
    tako da istoimene ulice u različitim opštinama (npr. Beogradska na Vračaru i u Sremčici)
    ostanu odvojene stavke sa sopstvenim koordinatama i dužinom.
    """
    klasteri_po_kljucu: dict[str, list[dict]] = {}

    for el in elements:
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue

        raw_name = tags.get("name:sr-Latn") or tags.get("name") or ""
        naziv_lat = u_latinicu(raw_name)
        # Ukloni suvišne oznake na početku ako postoje
        naziv_lat = re.sub(r"^(Ulica|ulica)\s+", "", naziv_lat).strip()
        if len(naziv_lat) < 2:
            continue

        k = kljuc(naziv_lat)
        if not k or len(k) < 2:
            continue

        # Izračunaj dužinu segmenta i središnju tačku
        seg_duzina = 0.0
        for i in range(len(geom) - 1):
            p1, p2 = geom[i], geom[i + 1]
            seg_duzina += haversine_m(p1["lat"], p1["lon"], p2["lat"], p2["lon"])

        mid_pt = geom[len(geom) // 2]
        mlat = float(mid_pt["lat"])
        mlon = float(mid_pt["lon"])

        postojeci_klasteri = klasteri_po_kljucu.setdefault(k, [])
        pripojen = False
        for kl in postojeci_klasteri:
            dist = haversine_m(mlat, mlon, kl["lat_sum"] / kl["cnt"], kl["lon_sum"] / kl["cnt"])
            if dist <= 3500.0:
                kl["duzina"] += seg_duzina
                kl["lat_sum"] += mlat
                kl["lon_sum"] += mlon
                kl["cnt"] += 1
                kl["tacke"].append((mlat, mlon))
                pripojen = True
                break

        if not pripojen:
            opstina = odredi_opstinu(mlat, mlon, tags)
            postojeci_klasteri.append(
                {
                    "naziv": naziv_lat,
                    "opstina": opstina,
                    "duzina": seg_duzina,
                    "lat_sum": mlat,
                    "lon_sum": mlon,
                    "cnt": 1,
                    "tacke": [(mlat, mlon)],
                }
            )

    ulice_kompaktno = []
    svi_kljucevi = set()

    for k, klasteri in klasteri_po_kljucu.items():
        svi_kljucevi.add(k)
        for kl in klasteri:
            # Za duže ulice većina segmenata je dvosmerna u OSM-u (npr. bulevari sa po 2 smera),
            # pa ako ima mnogo segmenata korigujemo procenu ili čuvamo zbirnu dužinu.
            clat = kl["lat_sum"] / kl["cnt"]
            clon = kl["lon_sum"] / kl["cnt"]
            # Izaberi tačku sa stvarne geometrije ulice koja je najbliža težištu (da tačka bude tačno na kolovozu)
            naj_tacka = min(
                kl["tacke"],
                key=lambda pt: haversine_m(clat, clon, pt[0], pt[1]),
            )
            duzina_m = max(25, int(round(kl["duzina"])))
            ulice_kompaktno.append(
                [
                    kl["naziv"],
                    kl["opstina"],
                    round(naj_tacka[0], 6),
                    round(naj_tacka[1], 6),
                    duzina_m,
                ]
            )

    ulice_kompaktno.sort(key=lambda x: (kljuc(x[0]), x[1]))
    return ulice_kompaktno, sorted(svi_kljucevi)


def main():
    root_dir = Path(__file__).resolve().parent.parent
    data = preuzmi_overpass_ulice()
    ulice_kompaktno, svi_kljucevi = obradi_elemente(data.get("elements", []))

    print(f"[OSM] Ukupno obrađeno {len(ulice_kompaktno)} beogradskih ulica ({len(svi_kljucevi)} jedinstvenih naziva).")

    # 1) Snimi public/data/ulice_beograd.json (i data/ulice_beograd.json ako postoji)
    izlazni_putevi = []
    if (root_dir / "public").exists():
        izlazni_putevi.append(root_dir / "public" / "data" / "ulice_beograd.json")
    if (root_dir / "data").exists() or not izlazni_putevi:
        izlazni_putevi.append(root_dir / "data" / "ulice_beograd.json")

    for putanja in izlazni_putevi:
        putanja.parent.mkdir(parents=True, exist_ok=True)
        with open(putanja, "w", encoding="utf-8") as f:
            json.dump(ulice_kompaktno, f, ensure_ascii=False, separators=(",", ":"))
        velicina_kb = putanja.stat().st_size / 1024.0
        print(f"[OSM] Snimljeno: {putanja} ({velicina_kb:.1f} KB)")

    # 2) Dopuni scrapers/recnik_nazivi.json postojećim + novim ključevima
    recnik_putanja = Path(__file__).resolve().parent / "recnik_nazivi.json"
    postojeci = set()
    if recnik_putanja.exists():
        try:
            with open(recnik_putanja, "r", encoding="utf-8") as f:
                postojeci = set(json.load(f))
        except Exception:
            pass

    spojeni_kljucevi = sorted(postojeci.union(svi_kljucevi))
    with open(recnik_putanja, "w", encoding="utf-8") as f:
        json.dump(spojeni_kljucevi, f, ensure_ascii=False, indent=2)
    print(f"[OSM] Ažuriran {recnik_putanja}: ukupno {len(spojeni_kljucevi)} normalizovanih naziva ulica.")


if __name__ == "__main__":
    main()
