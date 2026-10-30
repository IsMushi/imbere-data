"""Loading, the model card, and the household-column contract.

The contract test is the important one: `data/processed/households.csv` is the swap point for real
EICV7 microdata (docs/METHODOLOGY.md §6). If a column named here disappears, the engines break
silently rather than loudly.
"""
from __future__ import annotations

import threading

import numpy as np
import pytest

from app import datastore

# Every column the analytical layer reads. IMBERE's own columns (resilience_index,
# financial_health) are derived by build_data.py; the rest are the EICV7 concepts.
REQUIRED_HOUSEHOLD_COLUMNS = {
    "district",
    "urban",
    "hh_size",
    "head_education",
    "main_income_source",
    "modern_floor",
    "electricity",
    "corrugated_roof",
    "improved_sanitation",
    "owns_tv",
    "owns_radio",
    "owns_phone",
    "owns_bicycle",
    "health_insurance",
    "has_momo",
    "has_savings",
    "shock_experienced",
    "shock_type",
    "coping_response",
    "consumption_ae",
    "poor",
    "extreme_poor",
    "resilience_index",
    "financial_health",
}


def test_district_table_is_complete_and_ranked() -> None:
    districts = datastore.districts()
    assert len(districts) == 30
    rates = [d["poverty_2024"] for d in districts]
    assert rates == sorted(rates, reverse=True), "district_aggregates() must rank by poverty"


def test_households_csv_keeps_the_swap_contract() -> None:
    hh = datastore.households()
    missing = REQUIRED_HOUSEHOLD_COLUMNS - set(hh.columns)
    assert not missing, f"columns the engines read are gone: {sorted(missing)}"
    assert len(hh) > 10_000
    assert set(hh["district"]).issubset({d["district"] for d in datastore.districts()})


def test_model_card_describes_what_was_fitted() -> None:
    card = datastore.model_card()
    n = len(datastore.households())
    assert card["n_train"] + card["n_test"] == n
    assert card["algorithm"] == "HistGradientBoostingClassifier"
    assert 0.5 < card["auc_gradient_boosting"] < 1.0
    assert 0.5 < card["auc_logistic_baseline"] < 1.0
    assert len(card["importance"]) == len(card["features"]) == 18
    # The caveat is a documented commitment, not decoration: it must say the rows are synthetic.
    assert "synthetic" in card["caveat"].lower()


def test_risk_scores_are_probabilities_aligned_with_rows() -> None:
    risk = datastore.risk_scores()
    assert len(risk) == len(datastore.households())
    assert float(np.min(risk)) >= 0.0
    assert float(np.max(risk)) <= 1.0


def test_district_aggregates_cover_the_sample_exactly() -> None:
    agg = datastore.district_aggregates()
    assert sum(a["sample_households"] for a in agg) == len(datastore.households())
    for a in agg:
        assert 0.0 <= a["mean_risk"] <= 1.0
        assert set(a["financial_health"]) == {
            "healthy",
            "coping",
            "vulnerable",
            "extremely_vulnerable",
        }
        total = sum(a["financial_health"].values())
        assert 99.0 <= total <= 101.0, f"{a['district']} health bands sum to {total}"


def test_published_inputs_survive_into_the_payload() -> None:
    """Measured figures must come from the published tables, never from the model."""
    meta = datastore.meta()
    assert meta["poverty_lines"]["total_poverty_line_rwf_per_adult_equiv_year"] == 560_127
    assert meta["poverty_lines"]["extreme_poverty_line_rwf_per_adult_equiv_year"] == 356_432
    assert meta["national"]["poverty_rate_2024"] == 27.4
    assert meta["sources"], "the methodology page renders meta['sources']; it cannot be empty"
    for source in meta["sources"]:
        assert source["url"].startswith("http")
        assert source["license"]


def test_calibration_reports_what_the_rows_realised() -> None:
    cal = datastore.calibration()
    hh = datastore.households()
    assert cal["poverty_rate"] == round(100 * hh["poor"].mean(), 1)
    assert cal["extreme_poverty_rate"] == round(100 * hh["extreme_poor"].mean(), 1)
    assert cal["shock_incidence"] == round(100 * hh["shock_experienced"].mean(), 1)


def test_concurrent_cold_start_publishes_one_finished_state() -> None:
    """The first page load fires /api/meta and /api/districts at once. A half-built state used to
    raise KeyError('model_card') for the second caller."""
    datastore._state.clear()
    datastore._ready = False

    n = 6
    loaded: list[int] = []
    errors: list[BaseException] = []
    barrier = threading.Barrier(n)

    def worker() -> None:
        barrier.wait()
        try:
            st = datastore.get()
            st["model_card"]["auc_gradient_boosting"]
            loaded.append(int(st["hh_risk"].shape[0]))
        except BaseException as exc:  # noqa: BLE001 - re-raised below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"cold start raced: {errors[0]!r}"
    assert len(set(loaded)) == 1, f"inconsistent household counts: {loaded}"
