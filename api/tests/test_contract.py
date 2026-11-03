"""The household contract: the committed file passes it, and a bad file fails it.

`scripts/import_eicv7.py` uses `app.contract.validate_households` to refuse a mis-mapped extract
before it overwrites `households.csv`. That guard is only worth having if it is tested against the
failure modes it exists for, so each negative case below is a way a real swap goes wrong: columns
renamed differently, a district joined on the wrong key, a 1/2 indicator, a monthly-consumption
file, a blank size.
"""
from __future__ import annotations

import pandas as pd
import pytest

from app.contract import (
    REQUIRED_COLUMNS,
    design_columns_present,
    validate_households,
)

DISTRICTS = None  # filled by the fixture below


@pytest.fixture(scope="module")
def households() -> pd.DataFrame:
    from app import datastore

    return datastore.households()


@pytest.fixture(scope="module")
def district_names() -> list[str]:
    from app import datastore

    return [d["district"] for d in datastore.districts()]


def _sample(df: pd.DataFrame) -> dict:
    return {col: df[col].dropna().unique()[:200].tolist() for col in df.columns}


def test_committed_file_satisfies_the_contract(households, district_names) -> None:
    problems = validate_households(
        households.columns, district_names, rows=len(households), sample=_sample(households)
    )
    assert problems == [], f"committed households.csv violates its own contract: {problems}"


def test_contract_columns_are_the_ones_the_engines_read(households) -> None:
    assert set(REQUIRED_COLUMNS) <= set(households.columns)


def test_missing_column_is_reported(district_names, households) -> None:
    columns = [c for c in households.columns if c != "has_momo"]
    problems = validate_households(columns, district_names, rows=len(households))
    assert any("has_momo" in p for p in problems)


def test_unknown_district_is_reported(households, district_names) -> None:
    sample = _sample(households)
    sample["district"] = ["Kigali", "Nyarugenge"]  # "Kigali" is not one of the 30 districts
    problems = validate_households(households.columns, district_names, rows=10, sample=sample)
    assert any("Kigali" in p for p in problems)


def test_binary_column_outside_zero_one_is_reported(households, district_names) -> None:
    sample = _sample(households)
    sample["has_momo"] = [0, 1, 2]
    problems = validate_households(households.columns, district_names, rows=10, sample=sample)
    assert any("has_momo" in p and "0/1" in p for p in problems)


def test_household_size_bounds_are_reported(households, district_names) -> None:
    sample = _sample(households)
    sample["hh_size"] = [1, 4, 0]
    problems = validate_households(households.columns, district_names, rows=10, sample=sample)
    assert any("hh_size" in p for p in problems)


def test_negative_consumption_is_reported(households, district_names) -> None:
    sample = _sample(households)
    sample["consumption_ae"] = [500_000.0, -1.0]
    problems = validate_households(households.columns, district_names, rows=10, sample=sample)
    assert any("consumption_ae" in p for p in problems)


def test_wrong_currency_scale_is_reported(households, district_names) -> None:
    """A monthly figure or a thousands-scaled column is the common import mistake."""
    sample = _sample(households)
    sample["consumption_ae"] = [46_677.0]  # the published line divided by 12
    problems = validate_households(
        households.columns,
        district_names,
        rows=10,
        sample=sample,
        poverty_line=560_127.0,
    )
    assert any("currency scale" in p for p in problems)


def test_empty_file_is_reported(district_names, households) -> None:
    problems = validate_households(households.columns, district_names, rows=0)
    assert any("no rows" in p for p in problems)


def test_missing_district_reference_is_reported(households) -> None:
    problems = validate_households(households.columns, [], rows=10)
    assert any("valid district list" in p for p in problems)


def test_synthetic_layer_carries_no_design_columns(households) -> None:
    """The absence is the documented limitation: resampling intervals, not survey standard errors."""
    assert design_columns_present(households.columns) is False
