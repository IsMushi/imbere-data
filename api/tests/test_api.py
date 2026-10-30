"""HTTP contract.

These assert the shape the four pages consume, and the two regressions recorded in AGENTS.md: the
rule list must come from analytics.RULES (a set once made headline figures drift between runs), and
every household-level response must keep declaring itself synthetic.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import analytics, datastore
from app.main import app

client = TestClient(app)


def test_health() -> None:
    for path in ("/health", "/api/health"):
        assert client.get(path).json() == {"status": "ok"}


def test_meta_exposes_rules_in_RULES_order() -> None:
    body = client.get("/api/meta").json()
    assert [r["id"] for r in body["targeting_rules"]] == [r["id"] for r in analytics.RULES]
    assert set(body["shock_assumptions"]) == set(analytics.SHOCK_ASSUMPTIONS)
    assert body["microdata"]["kind"] == datastore.meta()["microdata"]["kind"]
    assert body["model_card"]["auc_gradient_boosting"] > 0.5


def test_targeting_defaults_match_the_documented_table() -> None:
    body = client.post("/api/targeting", json={}).json()
    rows = {r["id"]: r for r in body["results"]}
    assert list(rows) == [r["id"] for r in analytics.RULES]
    assert rows["pmt"]["targeting_accuracy"] == 78.2
    assert rows["pmt"]["coverage_of_poor"] == 37.8
    assert rows["pmt"]["leakage_rate"] == 21.9
    assert rows["pmt"]["cost_per_poor_reached"] == 191939
    assert body["budget_total"] == 300_000_000
    assert body["transfer_per_beneficiary"] == 150_000


def test_targeting_rejects_an_unknown_rule() -> None:
    r = client.post("/api/targeting", json={"rules": ["pmt", "ouija"]})
    assert r.status_code == 400
    assert "ouija" in r.json()["detail"]


def test_targeting_subset_returns_only_what_was_asked_for() -> None:
    body = client.post("/api/targeting", json={"rules": ["geographic"]}).json()
    assert [r["id"] for r in body["results"]] == ["geographic"]
    assert {row.split("_")[0] for row in body["coverage_curve"][0] if row != "caseload_pct"} == {
        "geographic"
    }


def test_targeting_rejects_non_positive_budget() -> None:
    assert client.post("/api/targeting", json={"budget_total": 0}).status_code == 422


def test_districts_endpoint_is_ranked_and_complete() -> None:
    body = client.get("/api/districts").json()
    assert len(body["districts"]) == 30
    assert body["districts"][0]["district"] == "Nyamagabe"


def test_district_lookup_is_case_insensitive_and_404s_cleanly() -> None:
    ok = client.get("/api/districts/nyamagabe")
    assert ok.status_code == 200
    assert ok.json()["district"] == "Nyamagabe"
    assert "resilience_index" in ok.json()

    missing = client.get("/api/districts/atlantis")
    assert missing.status_code == 404
    assert "atlantis" in missing.json()["detail"]


def test_model_endpoint_is_the_model_card() -> None:
    assert client.get("/api/model").json() == datastore.model_card()


def test_simulate_round_trip() -> None:
    body = client.post(
        "/api/simulate", json={"district": "Nyamagabe", "shock_type": "drought", "severity": 50}
    ).json()
    assert body["district"] == "Nyamagabe"
    assert body["shock_label"] == "Drought"
    assert body["result"]["cash_need_rwf"] > 0
    assert len(body["compare"]) == 7
    assert "synthetic" in body["microdata_kind"].lower()

    assert client.post(
        "/api/simulate", json={"district": "Nyamagabe", "shock_type": "volcano"}
    ).status_code == 400
    assert client.post(
        "/api/simulate", json={"district": "Nyamagabe", "shock_type": "drought", "severity": 150}
    ).status_code == 422
