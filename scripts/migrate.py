#!/usr/bin/env python3
"""One-shot migration: data/courses/*.json → Supabase.

Required env vars:
  SUPABASE_URL         https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY service_role key (bypasses RLS; never expose to frontend)

Optional:
  Load from a .env file alongside this script or export before running.

Usage:
  pip install supabase python-dotenv
  export SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...
  python scripts/migrate.py
"""

import json
import os
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
INDEX_PATH = PROJECT_ROOT / "data" / "courses_index.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

def series_to_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def build_course_row(meta: dict) -> dict:
    return {
        "race_id":     meta["race_id"],
        "name":        meta.get("name"),
        "series":      series_to_list(meta.get("series")),
        "country":     meta.get("country"),
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

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    entries = index["courses"]
    print(f"Found {len(entries)} courses in index.")

    total_courses = 0
    total_results = 0

    for entry in entries:
        race_id = entry["race_id"]
        course_file = PROJECT_ROOT / entry["path"]

        if not course_file.exists():
            print(f"  WARN  {race_id}: file not found at {course_file}, skipping.")
            continue

        data = json.loads(course_file.read_text(encoding="utf-8"))
        meta = data["meta"]
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
