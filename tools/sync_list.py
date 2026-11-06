#!/usr/bin/env python3
"""
Wird von GitHub Actions gestartet (siehe .github/workflows/sync-list.yml).
Liest die Liste mit einem Browser aus und sendet sie an den Server.
Benötigt die Umgebungsvariablen SOURCE_URL, LIST_ID und INGEST_SECRET.
"""
import json, os, sys, urllib.request, urllib.error
from import_challenge_list import parse_overview, parse_detail

API = os.environ.get("API_BASE", "https://besterregen.de/api")

def post(path, body):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + os.environ["INGEST_SECRET"],
            "User-Agent": "BesterRegen-Sync/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8") or "{}")

def main():
    url = os.environ["SOURCE_URL"]
    list_id = os.environ["LIST_ID"]
    base = url if url.endswith("/") else url + "/"
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(base, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(1500)
            entries = parse_overview(page.content(), base)
            if not entries:
                raise RuntimeError("Keine Einträge auf der Übersicht gefunden")
            for e in entries:
                try:
                    page.goto(e["detailUrl"], wait_until="networkidle", timeout=60000)
                    page.wait_for_timeout(600)
                    e.update(parse_detail(page.content()))
                except Exception as err:
                    print(f"#{e['rank']} übersprungen: {err}")
            browser.close()
        result = post("/sync/ingest", {"listId": list_id, "levels": entries})
        print(json.dumps(result, ensure_ascii=False))
    except Exception as err:
        try:
            post("/sync/fail", {"listId": list_id, "message": str(err)[:300]})
        finally:
            print(f"Fehler: {err}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
