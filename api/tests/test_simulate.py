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


def test_newly_poor_people_come_from_their_own_households(baseline: dict) -> None:
    """People are weighted by the size of the households that fell, not by the district mean."""
    r = baseline["result"]
    assert r["newly_poor_households"] < r["newly_poor_people"]
    assert r["newly_poor_people"] <= r["newly_poor_households"] * 12


def test_the_headline_carries_a_monotone_resampling_band(baseline: dict) -> None:
    """The UI prints the band beside the point estimate, so it must bracket it and be ordered."""
    r = baseline["result"]
    for point, band in (
        (r["newly_poor_households"], r["newly_poor_households_range"]),
        (r["newly_poor_people"], r["newly_poor_people_range"]),
    ):
        lo, hi = band
        assert lo < hi, "a band with no width would be a fake range"
        assert lo <= point <= hi, "the point estimate must sit inside its own band"
    # People vary more than households: sizes differ, so the band is wider on the same rows.
    assert r["newly_poor_people_range"][1] - r["newly_poor_people_range"][0] > (
        r["newly_poor_households_range"][1] - r["newly_poor_households_range"][0]
    )


def test_the_band_is_deterministic_so_the_post_cache_stays_valid(baseline: dict) -> None:
    again = analytics.simulate(DISTRICT, "drought", 50)["result"]
    assert again["newly_poor_households_range"] == baseline["result"]["newly_poor_households_range"]
    assert again["newly_poor_people_range"] == baseline["result"]["newly_poor_people_range"]


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


# --- compound shocks -------------------------------------------------------------------
def test_a_single_shock_is_reported_as_a_set_of_one(baseline: dict) -> None:
    assert baseline["combined"] is False
    assert len(baseline["shocks"]) == 1
    assert [c["id"] for c in baseline["components"]] == [baseline["shock_type"]]


def test_compound_shocks_hit_at_least_as_hard_as_either_alone(baseline: dict) -> None:
    """Two shocks cannot reach fewer households or cost less than one of them: exposure
    combines as 1 - prod(1 - p) and losses add before resilience absorbs them."""
    flood = analytics.simulate(DISTRICT, "flood", 50)
    both = analytics.simulate(
        DISTRICT, "drought", 50, additional=[{"shock_type": "flood", "severity": 50}]
    )
    assert both["combined"] is True
    assert len(both["shocks"]) == 2
    for key in ("exposed_households", "newly_poor_households", "cash_need_rwf"):
        assert both["result"][key] >= baseline["result"][key], key
        assert both["result"][key] >= flood["result"][key], key
    assert both["result"]["poverty_rate_after"] >= baseline["result"]["poverty_rate_after"]


def test_compound_components_attribute_each_shock(baseline: dict) -> None:
    both = analytics.simulate(
        DISTRICT, "drought", 50, additional=[{"shock_type": "flood", "severity": 50}]
    )
    by_id = {c["id"]: c for c in both["components"]}
    assert set(by_id) == {"drought", "flood"}
    assert by_id["drought"]["newly_poor_households"] == baseline["result"]["newly_poor_households"]


def test_an_unknown_additional_shock_is_rejected() -> None:
    with pytest.raises(KeyError):
        analytics.simulate(
            DISTRICT, "drought", 50, additional=[{"shock_type": "volcano", "severity": 50}]
        )

