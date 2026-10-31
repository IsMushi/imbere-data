"""Poverty measures: FGT identities, weighting, and the endpoint contract."""
from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import analytics, datastore
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module")
def measures() -> dict:
    return analytics.poverty_measures()


def test_fgt_measures_are_ordered(measures: dict) -> None:
    """P0 >= P1 >= P2 holds for any distribution because shortfalls are in (0, 1]."""
    n = measures["national"]
    assert 0 < n["poverty_gap_pct"] <= n["headcount_pct"] <= 100
    assert 0 < n["severity_pct"] <= n["poverty_gap_pct"]


def test_headcount_reproduces_the_calibrated_marginals(measures: dict) -> None:
    """The layer is *built* to hit the published marginals, so a large deviation means the
    calibration broke, not that Rwanda changed."""
    published = datastore.meta()["national"]
    n = measures["national"]
    assert abs(n["headcount_pct"] - published["poverty_rate_2024"]) < 1.0
    assert abs(n["headcount_extreme_pct"] - published["extreme_poverty_rate_2024"]) < 1.0


def test_every_district_is_covered(measures: dict) -> None:
    districts = measures["districts"]
    assert len(districts) == 30
    assert {d["district"] for d in districts} == {d["district"] for d in datastore.districts()}
    for row in districts:
        assert 0 <= row["headcount_pct"] <= 100
        assert row["severity_pct"] <= row["poverty_gap_pct"] <= row["headcount_pct"]
    headcounts = [d["headcount_pct"] for d in districts]
    assert headcounts == sorted(headcounts, reverse=True)


def test_gini_is_zero_for_a_constant_and_positive_here(measures: dict) -> None:
    ones = np.ones(100)
    assert analytics._weighted_gini(ones, ones) == 0.0
    assert 0 < measures["national"]["gini_consumption"] < 1


def test_weights_and_scope_are_declared(measures: dict) -> None:
    assert "synthetic" in measures["microdata_kind"].lower()
    assert measures["weights"] and "not design-based" in measures["weights"]
    assert "not an independent estimate" in measures["note"]


def test_poverty_endpoint_serves_the_same_numbers(measures: dict) -> None:
    body = client.get("/api/poverty").json()
    assert body["national"]["headcount_pct"] == measures["national"]["headcount_pct"]
    assert len(body["districts"]) == 30
