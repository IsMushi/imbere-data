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


def test_health_reports_liveness_and_readiness() -> None:
    for path in ("/health", "/api/health"):
        body = client.get(path).json()
        assert body["status"] == "ok"
        # conftest warms the datastore for the session, so readiness is already true here.
        assert body["model_ready"] is True
        assert body["uptime_s"] >= 0
        assert body["post_cache"]["capacity"] >= 0
        assert "warm" in body


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


def test_compound_shock_request_reaches_the_engine() -> None:
    body = client.post(
        "/api/simulate",
        json={
            "district": "Nyamagabe",
            "shock_type": "drought",
            "severity": 50,
            "additional_shocks": [{"shock_type": "flood", "severity": 50}],
        },
    ).json()
    assert body["combined"] is True
    assert {s["id"] for s in body["shocks"]} == {"drought", "flood"}
    single = client.post(
        "/api/simulate", json={"district": "Nyamagabe", "shock_type": "drought"}
    ).json()
    assert body["result"]["newly_poor_households"] >= single["result"]["newly_poor_households"]


def test_simulation_rejects_too_many_additional_shocks() -> None:
    payload = {
        "district": "Nyamagabe",
        "shock_type": "drought",
        "additional_shocks": [{"shock_type": "flood"}] * 7,
    }
    assert client.post("/api/simulate", json=payload).status_code == 422


def test_get_endpoints_are_cacheable_and_timed() -> None:
    r = client.get("/api/meta")
    assert "max-age" in r.headers["cache-control"]
    assert "stale-while-revalidate" in r.headers["cache-control"]
    assert r.headers["server-timing"].startswith("app;dur=")


def test_cors_preflight_is_answered() -> None:
    r = client.options(
        "/api/targeting",
        headers={
            "Origin": "https://imberedata.vercel.app",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code in (200, 204)
    assert "access-control-allow-origin" in {k.lower() for k in r.headers}


def test_rate_limit_returns_429_with_retry_after(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import main

    monkeypatch.setattr(main, "RATE_LIMIT", 2)
    main._HITS.clear()
    payload = {"district": "Nyamagabe", "shock_type": "drought"}
    assert client.post("/api/simulate", json=payload).status_code == 200
    assert client.post("/api/simulate", json=payload).status_code == 200
    blocked = client.post("/api/simulate", json=payload)
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
    main._HITS.clear()


def test_health_and_reads_are_not_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import main

    monkeypatch.setattr(main, "RATE_LIMIT", 1)
    main._HITS.clear()
    for _ in range(3):
        assert client.get("/api/meta").status_code == 200



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


def test_repeated_post_is_served_from_cache_with_identical_figures() -> None:
    """Both engines are deterministic, so a demo's second run must be the same answer, not a new one."""
    from app import main

    main._POST_CACHE.clear()
    payload = {"budget_total": 300_000_000, "transfer_per_beneficiary": 150_000}
    first = client.post("/api/targeting", json=payload)
    second = client.post("/api/targeting", json=payload)
    assert first.headers["x-imbere-cache"] == "miss"
    assert second.headers["x-imbere-cache"] == "hit"
    assert first.json() == second.json()


def test_cache_keeps_rule_order_distinct() -> None:
    """Order is part of the result, so two orders must never share one entry."""
    from app import main

    main._POST_CACHE.clear()
    a = client.post("/api/targeting", json={"rules": ["pmt", "geographic"]}).json()
    b = client.post("/api/targeting", json={"rules": ["geographic", "pmt"]}).json()
    assert [r["id"] for r in a["results"]] == ["pmt", "geographic"]
    assert [r["id"] for r in b["results"]] == ["geographic", "pmt"]
    assert main._POST_CACHE.stats()["size"] == 2


def test_cache_never_stores_a_rejected_request() -> None:
    from app import main

    main._POST_CACHE.clear()
    for _ in range(2):
        assert client.post("/api/targeting", json={"rules": ["ouija"]}).status_code == 400
    assert main._POST_CACHE.stats()["size"] == 0


def test_cache_is_bounded() -> None:
    from app import main

    small = main._PostCache(2)
    for i in range(5):
        small.put(str(i), {"i": i})
    assert small.stats()["size"] == 2
    assert small.get("0") is None  # evicted, oldest first
    assert small.get("4") == {"i": 4}



def test_protection_defaults_shape_and_labels() -> None:
    body = client.post("/api/protection", json={"district": "Nyamagabe"}).json()
    assert body["district"] == "Nyamagabe"
    assert body["shock_type"] == "drought"
    assert [row["transfer_rwf"] for row in body["ladder"]] == sorted(
        row["transfer_rwf"] for row in body["ladder"]
    )
    shares = [row["share_protected_pct"] for row in body["ladder"]]
    assert shares == sorted(shares)
    assert body["measured"]["shock_incidence"]["all"] == 37.1
    # Household-level scenario, so it must say the layer is synthetic.
    assert body["microdata_kind"] == "calibrated_synthetic"


def test_protection_rejects_unknown_district_and_shock() -> None:
    assert client.post("/api/protection", json={"district": "Atlantis"}).status_code == 400
    assert client.post(
        "/api/protection", json={"district": "Nyamagabe", "shock_type": "volcano"}
    ).status_code == 400


def test_protection_is_cached_by_request() -> None:
    from app import main

    main._POST_CACHE.clear()
    first = client.post("/api/protection", json={"district": "Gasabo", "shock_type": "flood"})
    second = client.post("/api/protection", json={"district": "Gasabo", "shock_type": "flood"})
    assert first.status_code == second.status_code == 200
    assert first.headers["X-Imbere-Cache"] == "miss"
    assert second.headers["X-Imbere-Cache"] == "hit"
    assert main._POST_CACHE.stats()["size"] == 1

def test_vup_block_matches_the_published_tables() -> None:
    body = client.post("/api/protection", json={"district": "Nyamagabe"}).json()
    vup = body["measured"]["vup"]
    assert vup["beneficiaries"]["total"] == 410000
    assert vup["beneficiaries"]["female_share_pct"] == 74.0
    assert vup["poverty"]["beneficiaries_pct"] == 40.9
    assert vup["poverty"]["national_pct"] == 27.4
    assert vup["timeliness"]["ds_on_time_pct"] == 15.1
    # The five shares are not a partition: households can hold more than one instrument, so they
    # total 104.7. Pinning the total keeps anyone from "fixing" the overlap by rescaling.
    assert sum(c["share_pct"] for c in vup["components"]) == pytest.approx(104.7)
    assert [c["id"] for c in vup["components"]][0] == "nsds"
