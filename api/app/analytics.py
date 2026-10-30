"""Targeting comparison and shock simulation.

Both engines are transparent by design: every number the dashboard shows can be traced to a
formula in this file plus a published input. Assumption constants are exported to the API so
the methodology panel can display them rather than hiding them in code.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import datastore

POVERTY_LINE = 560_127.0
EXTREME_LINE = 356_432.0

# ---------------------------------------------------------------------------------------
# Targeting
# ---------------------------------------------------------------------------------------
RULES = [
    {
        "id": "universal",
        "label": "Universal (no targeting)",
        "description": "Benefits allocated at random. The benchmark every other rule must beat.",
    },
    {
        "id": "geographic",
        "label": "Geographic targeting",
        "description": "Rank districts by headcount poverty rate, then allocate within them at random.",
    },
    {
        "id": "pmt",
        "label": "Proxy-means test (IMBERE model)",
        "description": "Rank households by the model's predicted probability of being poor, using only observable assets and characteristics.",
    },
    {
        "id": "community",
        "label": "Community-based (Ubudehe-style)",
        "description": "Rank by asset poverty, mimicking a community ranking of household wealth.",
    },
    {
        "id": "financial_exclusion",
        "label": "Financial-exclusion first",
        "description": "Prioritise households with no mobile money and no savings account, then by predicted risk.",
    },
]

ASSET_COLS = datastore.ASSET_COLS

# Each rule draws from its own stream, derived from the seed and the rule's fixed position in
# RULES. A single shared generator drawn in sequence made the figures depend on rule order and
# on which subset the caller asked for; /api/targeting once used a set() and the headline moved
# between server runs. With per-rule streams, reordering or subsetting changes nothing.
_RULE_OFFSET = {r["id"]: i for i, r in enumerate(RULES)}


def _rule_rng(seed: int, rid: str) -> np.random.Generator:
    return np.random.default_rng([seed, _RULE_OFFSET[rid]])


def _scores(rule: str, hh: pd.DataFrame, risk: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    if rule == "universal":
        return rng.random(len(hh))
    if rule == "geographic":
        # District rate dominates; the tiny jitter only breaks ties inside a district.
        return hh["district_poverty_rate"].to_numpy() + rng.random(len(hh)) * 0.01
    if rule == "pmt":
        return risk
    if rule == "community":
        asset_index = hh[ASSET_COLS].sum(axis=1).to_numpy()
        return -asset_index + rng.random(len(hh)) * 0.01
    if rule == "financial_exclusion":
        excluded = (1 - hh["has_momo"].to_numpy()) * 0.6 + (1 - hh["has_savings"].to_numpy()) * 0.4
        return excluded + risk * 0.5
    raise ValueError(f"unknown rule: {rule}")


def evaluate_targeting(
    budget_total: float,
    transfer_per_beneficiary: float,
    rule_ids: list[str] | None = None,
    seed: int = 7,
    bootstrap: int = 200,
) -> dict:
    st = datastore.get()
    hh = st["households"]
    risk = st["hh_risk"]

    n = len(hh)
    poor = hh["poor"].to_numpy().astype(bool)
    total_poor = int(poor.sum())

    requested = rule_ids or [r["id"] for r in RULES]
    n_ben = int(min(max(budget_total / transfer_per_beneficiary, 0), n))

    # One score vector per rule, reused by the headline, the curve and the bootstrap, so all
    # three describe the same allocation.
    scores = {rid: _scores(rid, hh, risk, _rule_rng(seed, rid)) for rid in requested}

    results = []
    for rid in requested:
        rule = next(r for r in RULES if r["id"] == rid)
        score = scores[rid]
        chosen = np.argsort(-score)[:n_ben] if n_ben > 0 else np.array([], dtype=int)
        hit = poor[chosen]
        poor_reached = int(hit.sum())
        nonpoor_reached = int(len(chosen) - poor_reached)
        spend = n_ben * transfer_per_beneficiary
        results.append(
            {
                "id": rid,
                "label": rule["label"],
                "description": rule["description"],
                "beneficiaries": n_ben,
                "poor_reached": poor_reached,
                "non_poor_reached": nonpoor_reached,
                "targeting_accuracy": round(100 * poor_reached / n_ben, 1) if n_ben else 0.0,
                "coverage_of_poor": round(100 * poor_reached / total_poor, 1) if total_poor else 0.0,
                "leakage_rate": round(100 * nonpoor_reached / n_ben, 1) if n_ben else 0.0,
                "exclusion_error": round(100 * (1 - poor_reached / total_poor), 1) if total_poor else 0.0,
                "spend_rwf": round(spend),
                "cost_per_poor_reached": round(spend / poor_reached) if poor_reached else None,
                "ci95": _bootstrap_interval(score, poor, n_ben, spend, seed, bootstrap),
            }
        )

    # Coverage curve: how much of the poor population each rule reaches as the caseload grows.
    steps = [5, 10, 15, 20, 30, 40, 50]
    curve = []
    for pct in steps:
        k = int(round(n * pct / 100))
        row = {"caseload_pct": pct}
        for rid in requested:
            chosen = np.argsort(-scores[rid])[:k]
            row[rid] = round(100 * poor[chosen].sum() / total_poor, 1)
        curve.append(row)

    return {
        "budget_total": round(budget_total),
        "transfer_per_beneficiary": round(transfer_per_beneficiary),
        "sample_households": n,
        "total_poor_in_sample": total_poor,
        "results": results,
        "coverage_curve": curve,
        "bootstrap_reps": bootstrap,
        "microdata_kind": st["meta"]["microdata"]["kind"],
    }


def _bootstrap_interval(
    score: np.ndarray, poor: np.ndarray, n_ben: int, spend: float, seed: int, reps: int
) -> dict[str, list[float]]:
    """Resample the household sample and re-rank it, 200 times.

    This measures how much each figure depends on which households happened to land in the
    synthetic sample. It is not the EICV7 sampling design and says nothing about non-sampling
    error; the UI and METHODOLOGY say so where the interval is shown.
    """
    if reps <= 0 or n_ben <= 0:
        return {}
    n = len(score)
    rng = np.random.default_rng(42)
    cov = np.empty(reps)
    leak = np.empty(reps)
    cost = np.empty(reps)
    for b in range(reps):
        idx = rng.integers(0, n, size=n)
        chosen = np.argsort(-score[idx])[:n_ben]
        hit = int(poor[idx][chosen].sum())
        cov[b] = 100 * hit / max(int(poor[idx].sum()), 1)
        leak[b] = 100 * (n_ben - hit) / n_ben
        cost[b] = spend / hit if hit else np.nan
    out = {}
    for key, arr in (("coverage_of_poor", cov), ("leakage_rate", leak), ("cost_per_poor_reached", cost)):
        lo, hi = np.nanpercentile(arr, [2.5, 97.5])
        out[key] = [round(float(lo), 1), round(float(hi), 1)]
    return out


# ---------------------------------------------------------------------------------------
# Shock simulation
# ---------------------------------------------------------------------------------------
# Exposure = share of households in the district hit when this shock occurs.
# Loss    = share of consumption lost by an exposed household at severity 100.
#
# Neither is estimated from EICV7, but they are not free parameters either. The base exposures
# below fix the *relative* burden of the seven shocks; a single scalar is then solved so that,
# at the baseline severity (50), the probability a household is hit by at least one of the seven
# equals the published 37.1% severe-shock incidence (Table 6.10). Without that calibration the
# union of the base values is 92.6% — a figure no Rwandan survey supports.
TARGET_SHOCK_INCIDENCE = 0.371
_BASE_EXPOSURE = {
    "drought": 0.35,
    "flood": 0.30,
    "storm": 0.20,
    "pest": 0.25,
    "health": 0.15,
    "food_price": 0.60,
    "income_loss": 0.20,
}


def _solve_exposure_scale(target: float) -> float:
    """Scale every base exposure so 1 - prod(1 - s * base) == target. Independence is assumed."""
    lo, hi = 0.0, 1.0 / max(_BASE_EXPOSURE.values())
    for _ in range(200):
        mid = (lo + hi) / 2.0
        union = 1.0 - np.prod([1.0 - mid * v for v in _BASE_EXPOSURE.values()])
        if union < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


_EXPOSURE_SCALE = _solve_exposure_scale(TARGET_SHOCK_INCIDENCE)

SHOCK_ASSUMPTIONS = {
    "drought": {"label": "Drought", "exposure": _BASE_EXPOSURE["drought"] * _EXPOSURE_SCALE, "loss": 0.28},
    "flood": {"label": "Flood / heavy downpour", "exposure": _BASE_EXPOSURE["flood"] * _EXPOSURE_SCALE, "loss": 0.35},
    "storm": {"label": "Storm / landslide", "exposure": _BASE_EXPOSURE["storm"] * _EXPOSURE_SCALE, "loss": 0.18},
    "pest": {"label": "Crop pest / disease outbreak", "exposure": _BASE_EXPOSURE["pest"] * _EXPOSURE_SCALE, "loss": 0.22},
    "health": {"label": "Health shock (illness or death)", "exposure": _BASE_EXPOSURE["health"] * _EXPOSURE_SCALE, "loss": 0.30},
    "food_price": {"label": "Food price spike", "exposure": _BASE_EXPOSURE["food_price"] * _EXPOSURE_SCALE, "loss": 0.12},
    "income_loss": {"label": "Job / income loss", "exposure": _BASE_EXPOSURE["income_loss"] * _EXPOSURE_SCALE, "loss": 0.25},
}

SEVERITY_NOTE = (
    "Severity scales both exposure and loss. At severity 50 the shock behaves like the "
    "assumed baseline; at 100 the impact is 1.8 times the baseline. Exposures are scaled so "
    "the seven shocks together reproduce the published 37.1% severe-shock incidence."
)


def _severity_multiplier(severity: float) -> float:
    # 0 -> 0.2x, 50 -> 1.0x, 100 -> 1.8x
    return 0.2 + 0.016 * max(0.0, min(100.0, severity))


def _simulate_one(sub: pd.DataFrame, shock_type: str, severity: float, scale: float) -> dict:
    a = SHOCK_ASSUMPTIONS[shock_type]
    sev = _severity_multiplier(severity)

    p_exp = np.full(len(sub), float(np.clip(a["exposure"] * sev, 0, 1)))
    resilience = (sub["resilience_index"].to_numpy() / 100.0)
    # Resilient households absorb more of the same shock.
    loss_frac = np.clip(a["loss"] * sev * (1 - 0.55 * resilience), 0, 0.95)

    cons = sub["consumption_ae"].to_numpy()
    new_cons = cons * (1 - loss_frac)
    was_poor = sub["poor"].to_numpy().astype(bool)
    was_extreme = sub["extreme_poor"].to_numpy().astype(bool)

    newly_poor = (~was_poor) & (new_cons < POVERTY_LINE)
    newly_extreme = (~was_extreme) & (new_cons < EXTREME_LINE)

    exp_newly_poor = float((p_exp * newly_poor).sum())
    exp_newly_extreme = float((p_exp * newly_extreme).sum())
    exp_exposed = float(p_exp.sum())

    # Cost to bring every household that ends up below the line back up to it, in RWF/year.
    # Deficit is zero above the line, so already-poor households contribute only their gap.
    deficit = np.maximum(0.0, POVERTY_LINE - new_cons)
    hh_size = sub["hh_size"].to_numpy()
    below_after = new_cons < POVERTY_LINE
    cash_need = float((p_exp * deficit * hh_size).sum())
    affected_households = float((p_exp * below_after).sum())

    n_sample = len(sub)
    after_poor = float((p_exp * newly_poor).sum() + was_poor.sum())
    return {
        "exposed_households": round(exp_exposed * scale),
        "newly_poor_households": round(exp_newly_poor * scale),
        "newly_poor_people": round(exp_newly_poor * scale * float(hh_size.mean())),
        "newly_extreme_poor_households": round(exp_newly_extreme * scale),
        "households_below_line_after": round(affected_households * scale),
        "poverty_rate_before": round(float(100 * was_poor.sum() / n_sample), 1),
        "poverty_rate_after": round(float(100 * after_poor / n_sample), 1),
        "mean_consumption_loss_pct": round(
            float(100 * (p_exp * loss_frac).sum() / max(p_exp.sum(), 1e-9)), 1
        ),
        "cash_need_rwf": round(cash_need * scale),
        "cash_need_per_household_rwf": (
            round(cash_need * scale / (affected_households * scale))
            if affected_households > 0
            else 0
        ),
        "resilience_index": round(float(sub["resilience_index"].mean()), 1),
    }


def simulate(district: str, shock_type: str, severity: float = 50.0) -> dict:
    st = datastore.get()
    if district not in st["district_by_name"]:
        raise KeyError(district)
    if shock_type not in SHOCK_ASSUMPTIONS:
        raise KeyError(shock_type)

    d = st["district_by_name"][district]
    sub = st["households"][st["households"]["district"] == district]
    scale = d["households"] / max(len(sub), 1)

    main = _simulate_one(sub, shock_type, severity, scale)

    # Same shock across every type, so the district profile can be compared at a glance.
    compare = []
    for sid, a in SHOCK_ASSUMPTIONS.items():
        r = _simulate_one(sub, sid, severity, scale)
        compare.append(
            {
                "id": sid,
                "label": a["label"],
                "newly_poor_households": r["newly_poor_households"],
                "cash_need_rwf": r["cash_need_rwf"],
            }
        )
    compare.sort(key=lambda r: r["newly_poor_households"], reverse=True)

    return {
        "district": district,
        "province": d["province"],
        "shock_type": shock_type,
        "shock_label": SHOCK_ASSUMPTIONS[shock_type]["label"],
        "severity": severity,
        "district_households": d["households"],
        "district_poverty_rate": d["poverty_2024"],
        "result": main,
        "compare": compare,
        "assumptions": {
            k: {"label": v["label"], "exposure": round(v["exposure"], 4), "loss": v["loss"]}
            for k, v in SHOCK_ASSUMPTIONS.items()
        },
        "implied_shock_incidence": round(
            100 * (1 - np.prod([1 - v["exposure"] for v in SHOCK_ASSUMPTIONS.values()])), 1
        ),
        "severity_note": SEVERITY_NOTE,
        "microdata_kind": st["meta"]["microdata"]["kind"],
    }
