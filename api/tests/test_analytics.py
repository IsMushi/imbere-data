"""Targeting engine.

The five rows at the default budget are quoted verbatim in README.md, docs/METHODOLOGY.md and
docs/SUBMISSION.md, so they are pinned exactly here. A drift means a seed, a calibration target or
the RNG call order changed, and all three documents are now wrong.
"""
from __future__ import annotations

import pytest

from app import analytics, datastore

BUDGET = 300_000_000
TRANSFER = 150_000

# id -> (accuracy, coverage, leakage, cost per poor household reached)
EXPECTED = {
    "universal": (28.8, 13.9, 71.2, 520833),
    "geographic": (45.3, 21.9, 54.7, 331126),
    "pmt": (78.2, 37.8, 21.9, 191939),
    "community": (57.6, 27.9, 42.4, 260417),
    "financial_exclusion": (61.0, 29.5, 39.0, 246103),
}


def _results(payload: dict) -> dict[str, dict]:
    return {r["id"]: r for r in payload["results"]}


@pytest.fixture(scope="module")
def default_run() -> dict:
    return analytics.evaluate_targeting(BUDGET, TRANSFER)


def test_documented_headline_figures(default_run: dict) -> None:
    got = _results(default_run)
    for rid, (acc, cov, leak, cost) in EXPECTED.items():
        row = got[rid]
        assert row["targeting_accuracy"] == acc, f"{rid} accuracy drifted"
        assert row["coverage_of_poor"] == cov, f"{rid} coverage drifted"
        assert row["leakage_rate"] == leak, f"{rid} leakage drifted"
        assert row["cost_per_poor_reached"] == cost, f"{rid} cost/poor drifted"


def test_proxy_means_beats_every_other_rule(default_run: dict) -> None:
    got = _results(default_run)
    pmt = got["pmt"]
    for rid, row in got.items():
        if rid == "pmt":
            continue
        assert pmt["targeting_accuracy"] > row["targeting_accuracy"]
        assert pmt["cost_per_poor_reached"] < row["cost_per_poor_reached"]


def test_rule_order_matches_RULES(default_run: dict) -> None:
    """The endpoint must build its list from analytics.RULES, never from a set: a set reorders the
    shared RNG stream and moves the universal / geographic figures between runs."""
    assert [r["id"] for r in default_run["results"]] == [r["id"] for r in analytics.RULES]


def test_same_seed_is_reproducible() -> None:
    a = _results(analytics.evaluate_targeting(BUDGET, TRANSFER, seed=11))
    b = _results(analytics.evaluate_targeting(BUDGET, TRANSFER, seed=11))
    assert a == b


def test_seed_only_moves_the_random_rules() -> None:
    a = _results(analytics.evaluate_targeting(BUDGET, TRANSFER, seed=11))
    b = _results(analytics.evaluate_targeting(BUDGET, TRANSFER, seed=12))
    assert a["universal"] != b["universal"]
    # pmt ranks on the model score and touches no randomness at all.
    assert a["pmt"] == b["pmt"]


def test_pmt_is_invariant_to_which_other_rules_are_requested() -> None:
    alone = _results(analytics.evaluate_targeting(BUDGET, TRANSFER, ["pmt"]))["pmt"]
    together = _results(analytics.evaluate_targeting(BUDGET, TRANSFER, ["universal", "pmt"]))["pmt"]
    assert alone == together


def test_budget_beyond_the_population_tops_out(default_run: dict) -> None:
    n = default_run["sample_households"]
    row = _results(analytics.evaluate_targeting(n * TRANSFER, TRANSFER))["pmt"]
    assert row["beneficiaries"] == n
    assert row["coverage_of_poor"] == 100.0
    assert row["leakage_rate"] == round(100 * row["non_poor_reached"] / n, 1)


def test_budget_below_one_transfer_selects_nobody(default_run: dict) -> None:
    row = _results(analytics.evaluate_targeting(1.0, TRANSFER))["pmt"]
    assert row["beneficiaries"] == 0
    assert row["targeting_accuracy"] == 0.0
    assert row["coverage_of_poor"] == 0.0
    assert row["spend_rwf"] == 0
    assert row["cost_per_poor_reached"] is None


def test_cash_need_accounting_is_consistent(default_run: dict) -> None:
    total_poor = default_run["total_poor_in_sample"]
    for row in default_run["results"]:
        assert row["poor_reached"] + row["non_poor_reached"] == row["beneficiaries"]
        assert row["spend_rwf"] == row["beneficiaries"] * TRANSFER
        assert row["exclusion_error"] == round(100 * (1 - row["poor_reached"] / total_poor), 1)


def test_coverage_curve_is_ordered_and_pmt_leads(default_run: dict) -> None:
    curve = default_run["coverage_curve"]
    assert [row["caseload_pct"] for row in curve] == [5, 10, 15, 20, 30, 40, 50]
    pmt = [row["pmt"] for row in curve]
    assert pmt == sorted(pmt), "coverage must not fall as the caseload grows"
    for row in curve:
        assert row["pmt"] >= row["universal"]


def test_response_declares_the_rows_as_synthetic(default_run: dict) -> None:
    """The documented invariant: household rows are calibrated synthetic and every response that
    touches them says so."""
    kind = default_run["microdata_kind"]
    assert kind == datastore.meta()["microdata"]["kind"]
    assert "synthetic" in kind.lower()
