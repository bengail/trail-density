#!/usr/bin/env python3
"""Build data/courses_index.json and data/courses/*.json from an Excel workbook.

Each sheet = one course (results table).
Expected columns (common exports):
  - Unnamed: 0   (rank)  OR Rank/#/Pos/Place
  - Runner       (name)  OR Athlete/Name
  - Race Score / UTMB Index / ITRA Score / Score / Index
Optional:
  - Gender
  - Nationality

Sheet name format examples:
  WS2025, UTMB2024, SZ2023, LEADVILLE2025, ...
"""

import json
import re
import sys
from pathlib import Path
import pandas as pd

def safe_float(x):
    try:
        if pd.isna(x):
            return None
        s = str(x).strip().replace(" ", "").replace(",", ".")
        return float(s)
    except Exception:
        return None

def safe_int(x):
    try:
        if pd.isna(x):
            return None
        return int(float(x))
    except Exception:
        return None

def main():
    if len(sys.argv) < 3:
        print("Usage: build_json_from_xlsx.py <input.xlsx> <output_dir>")
        raise SystemExit(2)

    xlsx_path = Path(sys.argv[1])
    out_root = Path(sys.argv[2])
    (out_root / "data" / "courses").mkdir(parents=True, exist_ok=True)

    xls = pd.ExcelFile(xlsx_path)
    courses_index = []

    for sheet in xls.sheet_names:
        df = pd.read_excel(xlsx_path, sheet_name=sheet)

        # rank col
        rank_col = None
        for c in df.columns:
            cl = str(c).strip().lower()
            if cl in ["rank", "#", "pos", "place"]:
                rank_col = c
                break
        if rank_col is None and "Unnamed: 0" in df.columns:
            rank_col = "Unnamed: 0"
        if rank_col is None:
            rank_col = df.columns[0]

        df = df[pd.to_numeric(df[rank_col], errors="coerce").notna()].copy()

        colmap = {}
        for c in df.columns:
            cl = str(c).strip().lower()
            if cl in ["runner", "athlete", "name"]:
                colmap["runner"] = c
            elif cl in ["race score", "score", "index", "utmb index", "itra score"]:
                colmap["index"] = c
            elif cl in ["gender", "sex"]:
                colmap["gender"] = c
            elif cl in ["nationality", "nation", "country"]:
                colmap["nationality"] = c

        if "index" not in colmap:
            for c in df.columns:
                cl = str(c).strip().lower()
                if "race score" in cl or "utmb" in cl or "itra" in cl:
                    colmap["index"] = c
                    break

        if "runner" not in colmap:
            for c in df.columns:
                cl = str(c).strip().lower()
                if "runner" in cl or "athlete" in cl or "name" in cl:
                    colmap["runner"] = c
                    break

        if "index" not in colmap:
            print(f"Skip sheet {sheet}: no score column")
            continue

        m = re.match(r"([A-Za-z]+)(\d{4})", sheet)
        code = m.group(1).upper() if m else sheet.upper()
        year = int(m.group(2)) if m else None

        meta = {
            "race_id": sheet,
            "name": sheet,
            "series": code,
            "country": None,
            "data_source": "ITRA",
            "year": year,
            "distance_km": None,
            "elevation_m": None,
            "prize_money": None,
            "notes": None,
            "source_url": None
        }

        results = []
        for _, r in df.iterrows():
            rank = safe_int(r[rank_col])
            if rank is None:
                continue
            idx = safe_float(r[colmap["index"]])
            if idx is None:
                continue
            results.append({
                "rank": rank,
                "runner": str(r[colmap["runner"]]).strip() if "runner" in colmap and pd.notna(r[colmap["runner"]]) else None,
                "index": idx,
                "gender": str(r[colmap["gender"]]).strip() if "gender" in colmap and pd.notna(r[colmap["gender"]]) else None,
                "nationality": str(r[colmap["nationality"]]).strip() if "nationality" in colmap and pd.notna(r[colmap["nationality"]]) else None
            })

        results = [x for x in results if x["rank"] is not None and x["rank"] >= 1]
        results.sort(key=lambda x: x["rank"])
        results = results[:300]

        course_obj = {"meta": meta, "results": results}
        (out_root / "data" / "courses" / f"{sheet}.json").write_text(
            json.dumps(course_obj, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        courses_index.append({
            "race_id": sheet,
            "name": meta["name"],
            "year": meta["year"],
            "series": meta["series"],
            "country": meta["country"],
            "data_source": meta["data_source"],
            "path": f"data/courses/{sheet}.json"
        })

    (out_root / "data" / "courses_index.json").write_text(
        json.dumps({"courses": courses_index}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"Wrote {len(courses_index)} courses.")

if __name__ == "__main__":
    main()
