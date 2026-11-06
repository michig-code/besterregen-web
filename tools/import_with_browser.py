#!/usr/bin/env python3
"""
Liest die Liste mit einem echten Browser (Chromium, im Hintergrund) aus.
Die Seite baut die Liste per JavaScript auf, deshalb reicht ein einfacher Abruf nicht.
Mit Zustimmung des Betreibers der Liste verwenden.

Einmalige Einrichtung (Eingabeaufforderung):
  pip install playwright
  python -m playwright install chromium

Nutzung:
  python import_with_browser.py --url https://bester-regen-challenge-list.page.gd/ --out liste.json
Ergebnis: liste.json (wie beim Import-Skript) und ein Ordner "details" mit den Einzelseiten.
"""
import argparse, json, os, re, sys
from import_challenge_list import parse_overview, parse_detail

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="Adresse der Übersicht")
    ap.add_argument("--out", default="liste.json")
    ap.add_argument("--details-dir", default="details")
    ap.add_argument("--max", type=int, default=500, help="höchste Platzierung, die geprüft wird")
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright fehlt. Bitte zuerst: pip install playwright  und  python -m playwright install chromium", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.details_dir, exist_ok=True)
    base = args.url if args.url.endswith("/") else args.url + "/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1) Übersicht laden und Einträge lesen
        page.goto(base, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(1500)
        overview_html = page.content()
        entries = parse_overview(overview_html, base)
        print(f"{len(entries)} Einträge in der Übersicht gefunden.", file=sys.stderr)
        if not entries:
            print("Keine Einträge gefunden. Bitte die Übersicht im Browser öffnen und prüfen, ob die Liste sichtbar ist.", file=sys.stderr)
            browser.close()
            sys.exit(2)

        # 2) Jede Einzelseite öffnen, speichern und auslesen
        for e in entries:
            rank = e["rank"]
            if rank > args.max:
                continue
            url = e.get("detailUrl") or f"{base}{rank}"
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(800)
                html = page.content()
                with open(os.path.join(args.details_dir, f"{rank}.html"), "w", encoding="utf-8") as f:
                    f.write(html)
                e.update(parse_detail(html))
                print(f"  #{rank} {e['name']} ok", file=sys.stderr)
            except Exception as err:
                print(f"  #{rank} {e['name']} FEHLER: {err}", file=sys.stderr)

        browser.close()

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"Gespeichert: {args.out}", file=sys.stderr)

if __name__ == "__main__":
    main()
