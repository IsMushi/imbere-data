"""Social protection scenario: a transfer delivered after a shock."""
from __future__ import annotations

import pytest

from app import analytics

DISTRICT = "Nyamagabe"


@pytest.fixture(scope="module")
def baseline() -> dict:
    return analytics.protection(DISTRICT, "drought", 50)


def test_unknown_inputs_are_rejected() -> None:
    with pytest.raises(KeyError):
        analytics.protection("Atlantis", "drought")
    with pytest.raises(KeyError):
        analytics.protection(DISTRICT, "volcano")


def test_measured_block_is_the_published_table(baseline: dict) -> None:
    measured = baseline["measured"]
    assert measured["shock_incidence"] == {"all": 37.1, "poor": 41.0, "non_poor": 35.6}
    coping = {c["id"]: c["all"] for c in measured["coping_responses"]}
    assert coping["received_help"] == 8.3
    assert len(measured["vup_components"]) == 7


def test_the_ladder_rises_with_the_transfer(baseline: dict) -> None:
    shares = [r["share_protected_pct"] for r in baseline["ladder"]]
    costs = [r["cost_rwf"] for r in baseline["ladder"]]
    assert shares == sorted(shares), "a larger transfer cannot protect fewer households"
    assert costs == sorted(costs)
    assert shares[0] < shares[-1], "the ladder must move across its range"


def test_money_and_counts_are_consistent(baseline: dict) -> None:
    ctx = baseline["district_context"]
    for row in baseline["ladder"]:
        assert row["households_protected"] <= ctx["newly_poor_households"] + 1
        assert 0 <= row["share_protected_pct"] <= 100
        assert row["cost_rwf"] == row["households_protected"] * row["transfer_rwf"] or \
            abs(row["cost_rwf"] - row["households_protected"] * row["transfer_rwf"]) <= \
            row["transfer_rwf"]
        assert row["cost_per_household_protected_rwf"] == row["transfer_rwf"]


def test_zero_transfer_protects_nobody() -> None:
    r = analytics.protection(DISTRICT, "drought", 50, transfers=[0])
    row = r["ladder"][0]
    assert row["households_protected"] == 0
    assert row["share_protected_pct"] == 0
    assert row["cost_rwf"] == 0


def test_a_full_transfer_covers_every_newly_poor_household() -> None:
    # Consumption is per adult equivalent, so a transfer only covers every deficit once it is at
    # least the poverty line times household size. Ten lines is comfortably enough.
    r = analytics.protection(DISTRICT, "drought", 50, transfers=[analytics.POVERTY_LINE * 10])
    assert r["ladder"][0]["share_protected_pct"] == 100


def test_the_same_request_gives_the_same_answer() -> None:
    assert analytics.protection(DISTRICT, "flood", 70) == analytics.protection(DISTRICT, "flood", 70)


def test_a_harsher_shock_pushes_more_households_down(baseline: dict) -> None:
    harsher = analytics.protection(DISTRICT, "drought", 100)
    assert harsher["district_context"]["newly_poor_households"] >= baseline["district_context"]["newly_poor_households"]
