"""Shock simulator."""
from __future__ import annotations

import pytest

from app import analytics, datastore

DISTRICT = "Nyamagabe"


@pytest.fixture(scope="module")
def baseline() -> dict:
    return analytics.simulate(DISTRICT, "drought", 50)


def test_unknown_district_and_shock_are_rejected() -> None:
    with pytest.raises(KeyError):
        analytics.simulate("Atlantis", "drought", 50)
    with pytest.raises(KeyError):
        analytics.simulate(DISTRICT, "volcano", 50)


def test_severity_moves_impact_monotonically() -> None:
    at = {s: analytics.simulate(DISTRICT, "drought", s)["result"] for s in (0, 50, 100)}
    for key in ("exposed_households", "newly_poor_households", "cash_need_rwf"):
        assert at[0][key] <= at[50][key] <= at[100][key], f"{key} is not monotonic in severity"
    assert at[0]["newly_poor_households"] < at[100]["newly_poor_households"]
    assert at[0]["cash_need_rwf"] < at[100]["cash_need_rwf"]


def test_a_shock_never_reduces_poverty(baseline: dict) -> None:
    r = baseline["result"]
    assert r["poverty_rate_after"] >= r["poverty_rate_before"]
    assert r["mean_consumption_loss_pct"] > 0
    assert r["cash_need_rwf"] > 0
    assert r["cash_need_per_household_rwf"] > 0


def test_scale_projects_the_sample_onto_the_district(baseline: dict) -> None:
    r = baseline["result"]
    assert r["households_below_line_after"] <= baseline["district_households"]
    assert r["exposed_households"] <= baseline["district_households"]
    assert r["newly_extreme_poor_households"] <= r["newly_poor_households"]


def test_comparison_covers_every_shock_sorted_by_impact(baseline: dict) -> None:
    compare = baseline["compare"]
    assert {c["id"] for c in compare} == set(analytics.SHOCK_ASSUMPTIONS)
    impact = [c["newly_poor_households"] for c in compare]
    assert impact == sorted(impact, reverse=True)
    # Rank by the assumed exposure x loss, not by a hard-coded label: flood (0.30 x 0.35 = 0.105)
    # edges drought (0.35 x 0.28 = 0.098), which is why the UI's example shock is not the costliest.
    expected_top = max(
        analytics.SHOCK_ASSUMPTIONS,
        key=lambda sid: analytics.SHOCK_ASSUMPTIONS[sid]["exposure"]
        * analytics.SHOCK_ASSUMPTIONS[sid]["loss"],
    )
    assert compare[0]["id"] == expected_top


def test_assumptions_are_exposed_not_hidden(baseline: dict) -> None:
    """The methodology panel renders these; they are stated assumptions, not EICV7 estimates."""
    assert set(baseline["assumptions"]) == set(analytics.SHOCK_ASSUMPTIONS)
    for shock in baseline["assumptions"].values():
        assert 0 < shock["exposure"] <= 1
        assert 0 < shock["loss"] < 1
        assert shock["label"]
    assert baseline["severity_note"]


def test_district_metadata_comes_from_the_published_table(baseline: dict) -> None:
    published = datastore.get()["district_by_name"][DISTRICT]
    assert baseline["district_poverty_rate"] == published["poverty_2024"]
    assert baseline["district_households"] == published["households"]
    assert baseline["province"] == published["province"]
    assert "synthetic" in baseline["microdata_kind"].lower()
