#!/usr/bin/env python3
"""Seed / re-seed Supabase from data/courses/*.json.

Required env vars:
  SUPABASE_URL         https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY service_role key (bypasses RLS; never expose to frontend)
                       Find it in: Supabase dashboard → Project Settings → API → service_role

Optional:
  Load from a .env file alongside this script or export before running.

Usage:
  pip install supabase python-dotenv
  export SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...
  python3 scripts/migrate.py
"""

import json
import os
import re
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv is optional

from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    sys.exit("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")

BATCH_SIZE = 500
PROJECT_ROOT = Path(__file__).parent.parent
COURSES_DIR = PROJECT_ROOT / "data" / "courses"

# ── Helpers ───────────────────────────────────────────────────────────────────

def series_to_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v and str(v).strip().lower() != "none"]
    if isinstance(value, str):
        s = value.strip()
        return [] if not s or s.lower() == "none" else [s]
    return []


COUNTRY_MAP = {
    "italia": "Italy",
    "ita":    "Italy",
    "suisse": "Switzerland",
    "schweiz": "Switzerland",
    "espana": "Spain",
    "españa": "Spain",
}

def normalize_country(value):
    if value is None:
        return None
    return COUNTRY_MAP.get(value.strip().lower(), value.strip())


def make_race_slug(race_id: str) -> str:
    return re.sub(r"_\d{4}$", "", race_id)


def build_course_row(meta: dict) -> dict:
    race_id = meta["race_id"]
    return {
        "race_id":     race_id,
        "race_slug":   meta.get("race_slug") or make_race_slug(race_id),
        "itra_id":     meta.get("itra_id"),
        "name":        meta.get("name"),
        "series":      series_to_list(meta.get("series")),
        "country":     normalize_country(meta.get("country")),
        "year":        meta.get("year"),
        "distance_km": meta.get("distance_km"),
        "elevation_m": meta.get("elevation_m"),
        "prize_money": meta.get("prize_money"),
        "data_source": meta.get("data_source"),
        "source_url":  meta.get("source_url"),
        "notes":       meta.get("notes"),
    }


def build_result_rows(course_id: str, results: list) -> list:
    rows = []
    for r in results:
        index = r.get("index")
        if index is None:
            continue  # skip rows without a score
        rows.append({
            "course_id":   course_id,
            "rank":        r["rank"],
            "runner":      r.get("runner"),
            "index":       index,
            "gender":      r.get("gender"),
            "nationality": r.get("nationality"),
        })
    return rows


def insert_batched(client: Client, table: str, rows: list) -> int:
    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        resp = client.table(table).insert(batch).execute()
        inserted += len(resp.data)
    return inserted

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    course_files = sorted(COURSES_DIR.glob("*.json"))
    print(f"Found {len(course_files)} course files in {COURSES_DIR}.")

    total_courses = 0
    total_results = 0

    for course_file in course_files:
        data = json.loads(course_file.read_text(encoding="utf-8"))
        meta = data.get("meta", {})
        race_id = meta.get("race_id") or course_file.stem
        raw_results = data.get("results", [])

        # Upsert course (update all fields on race_id conflict)
        course_row = build_course_row(meta)
        upsert_resp = (
            client.table("courses")
            .upsert(course_row, on_conflict="race_id")
            .execute()
        )
        course_id = upsert_resp.data[0]["id"]

        # Replace results for this course (idempotency)
        client.table("results").delete().eq("course_id", course_id).execute()

        result_rows = build_result_rows(course_id, raw_results)
        n = insert_batched(client, "results", result_rows)

        print(f"  OK    {race_id}: {n} results")
        total_courses += 1
        total_results += n

    print(f"\nDone. {total_courses} courses, {total_results} results inserted.")


if __name__ == "__main__":
    main()
