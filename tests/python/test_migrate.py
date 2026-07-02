import os
import sys
from unittest.mock import MagicMock

import pytest

# Mock supabase before importing migrate (avoid import-time errors)
sys.modules.setdefault("supabase", MagicMock())
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

from migrate import series_to_list, build_course_row, build_result_rows, make_race_slug


class TestSeriesToList:
    def test_returns_empty_list_for_none(self):
        assert series_to_list(None) == []

    def test_passes_through_list(self):
        assert series_to_list(["GTWS", "UTMB"]) == ["GTWS", "UTMB"]

    def test_wraps_string_in_list(self):
        assert series_to_list("GTWS") == ["GTWS"]

    def test_empty_list_stays_empty(self):
        assert series_to_list([]) == []

    def test_filters_none_string_in_list(self):
        assert series_to_list(["UTMB", "none"]) == ["UTMB"]
        assert series_to_list(["none"]) == []

    def test_returns_empty_for_none_string(self):
        assert series_to_list("none") == []
        assert series_to_list("") == []


class TestMakeRaceSlug:
    def test_strips_year_suffix(self):
        assert make_race_slug("CCC_2025") == "CCC"
        assert make_race_slug("BLACKCANYON_100K_2025") == "BLACKCANYON_100K"

    def test_leaves_string_without_year_unchanged(self):
        assert make_race_slug("CCC") == "CCC"


class TestBuildCourseRow:
    def _meta(self, **kwargs):
        defaults = {
            "race_id": "UTMB_2025",
            "name": "UTMB 2025",
            "series": ["UTMB"],
            "country": "France",
            "year": 2025,
            "distance_km": 171.0,
            "elevation_m": 10000.0,
            "prize_money": 300000.0,
            "data_source": "ITRA",
            "source_url": "https://itra.run/...",
            "notes": None,
        }
        defaults.update(kwargs)
        return defaults

    def test_maps_all_fields(self):
        row = build_course_row(self._meta())
        assert row["race_id"] == "UTMB_2025"
        assert row["name"] == "UTMB 2025"
        assert row["country"] == "France"
        assert row["year"] == 2025

    def test_derives_race_slug_from_race_id(self):
        row = build_course_row(self._meta())
        assert row["race_slug"] == "UTMB"

    def test_uses_provided_race_slug(self):
        row = build_course_row(self._meta(race_slug="UTMB"))
        assert row["race_slug"] == "UTMB"

    def test_itra_id_defaults_to_none(self):
        row = build_course_row(self._meta())
        assert row["itra_id"] is None

    def test_preserves_itra_id(self):
        row = build_course_row(self._meta(itra_id=12345))
        assert row["itra_id"] == 12345

    def test_converts_series_string_to_list(self):
        row = build_course_row(self._meta(series="UTMB"))
        assert row["series"] == ["UTMB"]

    def test_handles_none_series(self):
        row = build_course_row(self._meta(series=None))
        assert row["series"] == []

    def test_filters_none_from_series(self):
        row = build_course_row(self._meta(series=["GTWS", "none"]))
        assert row["series"] == ["GTWS"]

    def test_passes_optional_none_fields(self):
        row = build_course_row(self._meta(notes=None, prize_money=None))
        assert row["notes"] is None
        assert row["prize_money"] is None


class TestBuildResultRows:
    def _result(self, **kwargs):
        defaults = {
            "rank": 1,
            "runner": "ELAZZAOUI Elhousine",
            "index": 936.0,
            "gender": "M",
            "nationality": "MAR",
        }
        defaults.update(kwargs)
        return defaults

    def test_builds_result_rows_with_course_id(self):
        rows = build_result_rows("uuid-123", [self._result()])
        assert len(rows) == 1
        assert rows[0]["course_id"] == "uuid-123"
        assert rows[0]["rank"] == 1
        assert rows[0]["runner"] == "ELAZZAOUI Elhousine"
        assert rows[0]["index"] == 936.0

    def test_skips_rows_without_index(self):
        rows = build_result_rows("uuid-123", [
            self._result(rank=1, index=900),
            self._result(rank=2, index=None),
            self._result(rank=3, index=850),
        ])
        assert len(rows) == 2
        assert rows[0]["rank"] == 1
        assert rows[1]["rank"] == 3

    def test_preserves_optional_fields(self):
        rows = build_result_rows("uuid", [self._result(gender=None, nationality=None)])
        assert rows[0]["gender"] is None
        assert rows[0]["nationality"] is None

    def test_empty_results_returns_empty_list(self):
        assert build_result_rows("uuid", []) == []


class TestNormalizeCountry:
    def test_maps_italia_to_italy(self):
        from migrate import normalize_country
        assert normalize_country("Italia") == "Italy"

    def test_maps_ita_to_italy(self):
        from migrate import normalize_country
        assert normalize_country("ITA") == "Italy"

    def test_maps_suisse_to_switzerland(self):
        from migrate import normalize_country
        assert normalize_country("Suisse") == "Switzerland"

    def test_case_insensitive(self):
        from migrate import normalize_country
        assert normalize_country("schweiz") == "Switzerland"
        assert normalize_country("ITALIA") == "Italy"

    def test_passes_through_known_good(self):
        from migrate import normalize_country
        assert normalize_country("Canada") == "Canada"
        assert normalize_country("France") == "France"

    def test_returns_none_for_none(self):
        from migrate import normalize_country
        assert normalize_country(None) is None

    def test_trims_whitespace(self):
        from migrate import normalize_country
        assert normalize_country("  Italia  ") == "Italy"
