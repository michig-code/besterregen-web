#!/usr/bin/env python3
"""
Liest eine Pointercrate-artige Liste aus und speichert sie als JSON.

Nutzung (auf deinem PC, nur für Seiten, deren Betreiber zugestimmt hat):
  python import_challenge_list.py --url https://bester-regen-challenge-list.page.gd/ --details --out liste.json
  python import_challenge_list.py --file "Main_List.html" --out liste.json      (lokal gespeicherte Seite)

Ohne --details werden nur die Angaben der Übersicht gelesen.
Mit --details wird jede Einzelseite (/1, /2, ...) abgerufen und Level-ID, Länge usw. ergänzt.
Es werden keine Daten verändert, es wird nur gelesen. Zwischen Anfragen wird kurz gewartet.
"""
import argparse, html, json, re, sys, time, urllib.request
from urllib.parse import urljoin

UA = "BesterRegen-Import/1.0 (Listen-Export mit Zustimmung des Betreibers)"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")

def text_of(fragment):
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()

def parse_overview(page, base_url):
    entries = []
    blocks = re.split(r'<section class="panel fade flex mobile-col"', page)[1:]
    for block in blocks:
        rank_m = re.search(r"#(\d+)\s*[–-]\s*(.+?)\s*</a>", block, re.S)
        if not rank_m:
            continue
        rank = int(rank_m.group(1))
        name = text_of(rank_m.group(2))
        byline_m = re.search(r'<h3 class="demon-card-byline"[^>]*>(.*?)</h3>', block, re.S)
        byline = text_of(byline_m.group(1)) if byline_m else ""
        pub_m = re.search(r"published by\s+(.+?)(?:,\s*verified by|$)", byline)
        ver_m = re.search(r"verified by\s+(.+)$", byline)
        points_m = re.search(r'<div class="demon-points"[^>]*>(.*?)</div>', block, re.S)
        points_txt = text_of(points_m.group(1)) if points_m else ""
        # erster Wert vor der Klammer ist der Punktestand, z. B. "350.00 (100%) — …"
        pts = re.search(r"^([\d.,]+)\s*\(", points_txt)
        video_m = re.search(r"ytimg\.com/vi/([\w-]{11})/", block)
        detail_m = re.search(r'<a class="thumb[^"]*"\s+href="([^"]+)"', block)
        entries.append({
            "rank": rank,
            "name": name,
            "publisher": text_of(pub_m.group(1)) if pub_m else None,
            "verifier": text_of(ver_m.group(1)) if ver_m else None,
            "points": float(pts.group(1).replace(",", "")) if pts else None,
            "videoId": video_m.group(1) if video_m else None,
            "detailUrl": urljoin(base_url, detail_m.group(1)) if detail_m else urljoin(base_url, f"/{rank}"),
        })
    return entries

def parse_length(txt):
    m = re.match(r"^(\d+):(\d{1,2})$", txt)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.match(r"^(\d+)\s*s", txt)
    return int(m.group(1)) if m else None

def parse_detail(page):
    t = text_of(page)
    def grab(label, pattern=r"(.+?)(?=\s(?:Position|Category|Difficulty|Requirement|Created by|Published by|Verified by|Level ID|Level Length|Song|NONG|Objects|At Requirement|At 100%|Completions|Raw Footage)\b|$)"):
        m = re.search(re.escape(label) + r"\s+" + pattern, t)
        return m.group(1).strip() if m else None
    length_txt = grab("Level Length", r"(\S+)")
    req_txt = grab("Requirement", r"(\d+)\s*%")
    objects_txt = grab("Objects", r"(\d+)")
    return {
        "levelId": grab("Level ID", r"(\d+)"),
        "lengthSeconds": parse_length(length_txt or ""),
        "difficulty": grab("Difficulty"),
        "requirement": int(req_txt) if req_txt else None,
        "song": grab("Song"),
        "objects": int(objects_txt) if objects_txt else None,
        "nong": grab("NONG"),
        "creators": grab("Created by"),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="Adresse der Übersicht, z. B. https://…/")
    ap.add_argument("--file", help="lokal gespeicherte Übersichtsseite")
    ap.add_argument("--details", action="store_true", help="jede Einzelseite abrufen")
    ap.add_argument("--out", default="liste.json")
    ap.add_argument("--delay", type=float, default=1.0, help="Pause zwischen Anfragen in Sekunden")
    ap.add_argument("--details-dir", help="Ordner mit gespeicherten Einzelseiten (Dateinamen beginnen mit der Platzierung, z. B. '#1 - Name.html')")
    args = ap.parse_args()
    if not args.url and not args.file:
        ap.error("--url oder --file angeben")

    base = args.url or "https://bester-regen-challenge-list.page.gd/"
    if args.file:
        with open(args.file, encoding="utf-8", errors="replace") as f:
            page = f.read()
    else:
        page = fetch(base)

    entries = parse_overview(page, base)
    print(f"{len(entries)} Einträge in der Übersicht gefunden.", file=sys.stderr)

    if args.details_dir:
        import os
        files = {}
        for name in os.listdir(args.details_dir):
            m = re.match(r"^#?(\d+)\b", name)
            if m and name.lower().endswith((".html", ".htm")):
                files[int(m.group(1))] = os.path.join(args.details_dir, name)
        for e in entries:
            path = files.get(e["rank"])
            if not path:
                print(f"  #{e['rank']} {e['name']}: keine gespeicherte Seite gefunden", file=sys.stderr)
                continue
            with open(path, encoding="utf-8", errors="replace") as f:
                e.update(parse_detail(f.read()))
        print(f"{len(files)} gespeicherte Einzelseiten gelesen.", file=sys.stderr)

    if args.details:
        for e in entries:
            try:
                e.update(parse_detail(fetch(e["detailUrl"])))
                print(f"  #{e['rank']} {e['name']} ok", file=sys.stderr)
            except Exception as err:
                print(f"  #{e['rank']} {e['name']} FEHLER: {err}", file=sys.stderr)
            time.sleep(args.delay)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"Gespeichert: {args.out}", file=sys.stderr)

if __name__ == "__main__":
    main()
