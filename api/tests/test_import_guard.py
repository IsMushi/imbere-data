"""The import guard that stops a price-base mismatch from becoming a published poverty rate.

EICV7's `cons1ae` compared with the published line yields 41.5%, not 27.4%, because the two are not
on the same base. These tests pin the refusal, so the importer cannot silently ship the wrong rate.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
_SPEC = importlib.util.spec_from_file_location("import_eicv7", ROOT / "scripts" / "import_eicv7.py")
assert _SPEC and _SPEC.loader
importer = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(importer)


def _frame(poor: int, n: int = 100) -> pd.DataFrame:
    return pd.DataFrame({"poor": [1] * poor + [0] * (n - poor)})


def test_published_headcount_passes() -> None:
    # 27 of 100 against the published 27.4% is inside tolerance, by construction.
    assert importer.target_problem(_frame(27)) is None


def test_the_raw_consumption_comparison_is_refused() -> None:
    # 41 or 42 out of 100 is what `cons1ae < Poverty_line` produces on the real EICV7 file.
    for poor in (41, 42):
        message = importer.target_problem(_frame(poor))
        assert message is not None
        assert "price base" in message


def test_the_benchmark_is_the_published_figure() -> None:
    # The importer once carried 5.7 for extreme poverty; the published table and the file give 5.4.
    assert importer.BENCHMARKS["extreme_poor"] == 5.4
