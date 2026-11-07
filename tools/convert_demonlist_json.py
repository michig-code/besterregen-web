#!/usr/bin/env python3
"""
Wandelt eine Demonlist im JSON-Format (Ordner mit _list.json und einer Datei pro Level)
in das Format des Imports um. Nur lesen, es wird nichts verändert.

Nutzung:
  python convert_demonlist_json.py --dir ./demonlist_data --out liste.json
Der Ordner muss _list.json und die Level-Dateien enthalten (z. B. Convulsion.json).
"""
import argparse, json, os, re

def video_id(url):
    m = re.search(r"(?:youtu\.be/|v=|embed/)([\w-]{11})", url or "")
    return m.group(1) if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", default="liste.json")
    args = ap.parse_args()
    with open(os.path.join(args.dir, "_list.json"), encoding="utf-8") as f:
        names = json.load(f)
    entries = []
    missing = []
    for rank, name in enumerate(names, start=1):
        path = os.path.join(args.dir, f"{name}.json")
        if not os.path.exists(path):
            missing.append(name)
            continue
        with open(path, encoding="utf-8") as f:
            lvl = json.load(f)
        records = []
        for r in lvl.get("records", []):
            pct = int(r.get("percent", 100))
            records.append({
                "player": r.get("user"),
                "progress": f"{pct}%",
                "percent": pct,
                "videoUrl": r.get("link"),
            })
        entries.append({
            "rank": rank,
            "name": lvl.get("name"),
            "publisher": lvl.get("author"),
            "verifier": lvl.get("verifier"),
            "videoId": video_id(lvl.get("verification")),
            "levelId": str(lvl.get("id")) if lvl.get("id") is not None else None,
            "lengthSeconds": None,
            "requirement": lvl.get("percentToQualify", 50),
            "creators": ", ".join(lvl.get("creators", [])) or None,
            "records": records,
        })
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"{len(entries)} Level umgewandelt, {len(missing)} fehlen: {missing}")

if __name__ == "__main__":
    main()
