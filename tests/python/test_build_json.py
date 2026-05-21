import math
import pytest

from build_json_from_xlsx import safe_float, safe_int


class TestSafeFloat:
    def test_converts_numeric_string(self):
        assert safe_float("3.14") == pytest.approx(3.14)

    def test_handles_comma_decimal(self):
        assert safe_float("3,14") == pytest.approx(3.14)

    def test_strips_spaces(self):
        assert safe_float(" 42 ") == pytest.approx(42.0)

    def test_returns_none_for_blank(self):
        assert safe_float("") is None

    def test_returns_none_for_non_numeric(self):
        assert safe_float("abc") is None

    def test_returns_none_for_nan_sentinel(self):
        import pandas as pd
        assert safe_float(pd.NA) is None
        assert safe_float(float("nan")) is None

    def test_returns_integer_as_float(self):
        assert safe_float(42) == 42.0

    def test_zero_is_valid(self):
        assert safe_float("0") == 0.0


class TestSafeInt:
    def test_converts_integer_string(self):
        assert safe_int("1") == 1
        assert safe_int("42") == 42

    def test_truncates_float_string(self):
        assert safe_int("3.9") == 3

    def test_returns_none_for_blank(self):
        assert safe_int("") is None

    def test_returns_none_for_non_numeric(self):
        assert safe_int("abc") is None

    def test_returns_none_for_nan_sentinel(self):
        import pandas as pd
        assert safe_int(pd.NA) is None

    def test_converts_float(self):
        assert safe_int(5.0) == 5
