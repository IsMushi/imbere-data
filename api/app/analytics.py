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

    # Geographic fairness: a rule can reach the poor and still concentrate the caseload in a
    # handful of districts. Compare each rule's share of beneficiaries in the ten poorest
    # districts with those districts' share of the poor. 1.0 is proportional, >1 concentrates.
    poorest = {d["district"] for d in sorted(st["districts"], key=lambda r: -r["poverty_2024"])[:10]}
    in_poorest = hh["district"].isin(poorest).to_numpy()
    poor_share = float(poor[in_poorest].sum() / max(total_poor, 1))
    fairness = {}
    for rid in requested:
        chosen = np.argsort(-scores[rid])[:n_ben] if n_ben else np.array([], dtype=int)
        if len(chosen) == 0:
            fairness[rid] = {"districts_reached": 0, "share_to_poorest_decile": 0.0, "fairness_ratio": None}
            continue
        beneficiaries = float(in_poorest[chosen].sum() / len(chosen))
        fairness[rid] = {
            "districts_reached": int(len({hh["district"].iat[i] for i in chosen})),
            "share_to_poorest_decile": round(100 * beneficiaries, 1),
            "fairness_ratio": round(beneficiaries / poor_share, 2) if poor_share else None,
        }

    return {
        "budget_total": round(budget_total),
        "transfer_per_beneficiary": round(transfer_per_beneficiary),
        "sample_households": n,
        "total_poor_in_sample": total_poor,
        "results": results,
        "coverage_curve": curve,
        "fairness": fairness,
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
# Poverty measures (FGT)
# ---------------------------------------------------------------------------------------
def _weighted_gini(values: np.ndarray, weights: np.ndarray) -> float:
    """Weighted Gini by the Lerman-Yitzhaki covariance formula (zero for a constant vector)."""
    order = np.argsort(values)
    x = values[order].astype(float)
    w = weights[order].astype(float)
    total_w = w.sum()
    if total_w <= 0 or x.sum() <= 0:
        return 0.0
    share_before = np.cumsum(w) - 0.5 * w  # mid-rank cumulative weight
    mean = float((w * x).sum() / total_w)
    return float(max(0.0, 2.0 * (share_before * w * x).sum() / (total_w**2 * mean) - 1.0))


def _fgt(
    consumption: np.ndarray, weights: np.ndarray, line: float
) -> dict[str, float]:
    """Foster-Greer-Thorbecke measures at the given line.

    P(alpha) = (1/W) * sum_i w_i * ((line - y_i)/line)^alpha for y_i below the line.
    alpha 0 is the headcount, 1 the poverty gap (depth), 2 the squared gap (severity).
    """
    w = weights.astype(float)
    y = consumption.astype(float)
    total_w = float(w.sum())
    shortfall = np.clip((line - y) / line, 0.0, None)
    below = (y < line).astype(float)
    return {
        "headcount_pct": round(100 * float((w * below).sum() / total_w), 2),
        "poverty_gap_pct": round(100 * float((w * shortfall).sum() / total_w), 2),
        "severity_pct": round(100 * float((w * shortfall**2).sum() / total_w), 2),
    }


def poverty_measures() -> dict:
    """FGT measures, mean and median consumption, and inequality on the calibrated layer.

    Household size is used as the weight, which is the correct weight for a per-capita measure
    computed from per-adult-equivalent consumption *given this file*. It is not an EICV7 survey
    weight: the synthetic layer has no sampling design, no strata and no primary sampling units,
    so these are descriptive statistics about the prototype, not design-based national estimates.
    """
    st = datastore.get()
    hh = st["households"]
    y = hh["consumption_ae"].to_numpy()
    w = hh["hh_size"].to_numpy()

    national = _fgt(y, w, POVERTY_LINE)
    national_extreme = _fgt(y, w, EXTREME_LINE)

    districts = []
    for d in st["districts"]:
        mask = (hh["district"] == d["district"]).to_numpy()
        if not mask.any():
            continue
        m = _fgt(y[mask], w[mask], POVERTY_LINE)
        districts.append(
            {
                "district": d["district"],
                "province": d["province"],
                "sample_households": int(mask.sum()),
                "published_headcount": d["poverty_2024"],
                **m,
            }
        )

    by_area = []
    for label, key in (("Urban", "urban"), ("Rural", "rural")):
        mask = (hh["urban"] == (1 if key == "urban" else 0)).to_numpy()
        if mask.any():
            by_area.append({"area": label, **_fgt(y[mask], w[mask], POVERTY_LINE)})

    mean_y = float((w * y).sum() / w.sum())
    order = np.argsort(y)
    cum = np.cumsum(w[order])
    median_y = float(y[order][np.searchsorted(cum, 0.5 * cum[-1])])

    return {
        "scope": "calibrated synthetic households",
        "rows": int(len(hh)),
        "weights": (
            "household size, used as the per-capita weight; the synthetic layer carries no "
            "sampling design, so these are not design-based estimates"
        ),
        "lines": {
            "total_poverty_line_rwf": POVERTY_LINE,
            "extreme_poverty_line_rwf": EXTREME_LINE,
            "price_base": "January 2024",
        },
        "national": {
            **national,
            "headcount_extreme_pct": national_extreme["headcount_pct"],
            "mean_consumption_ae_rwf": round(mean_y),
            "median_consumption_ae_rwf": round(median_y),
            "gini_consumption": round(_weighted_gini(y, w), 3),
        },
        "by_area": by_area,
        "districts": sorted(districts, key=lambda r: -r["headcount_pct"]),
        "microdata_kind": st["meta"]["microdata"]["kind"],
        "note": (
            "FGT measures computed on the calibrated synthetic layer. The published national "
            "headcount (27.4%) comes from EICV7 microdata with its survey design; this figure "
            "reproduces the marginals by construction and is not an independent estimate."
        ),
    }


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


def _simulate_set(sub: pd.DataFrame, shocks: list[tuple[str, float]], scale: float) -> dict:
    """One or more shocks applied to the same households.

    Exposure combines independently (1 - prod(1 - p_j)); losses add and then pass through the
    same resilience absorption, so a household with savings and insurance still keeps 55% of its
    headroom regardless of how many shocks arrive. With a single shock this reduces exactly to
    the one-shock formula the documented figures use.
    """
    resilience = (sub["resilience_index"].to_numpy() / 100.0)
    keep = np.ones(len(sub))
    loss_raw = np.zeros(len(sub))
    for shock_type, severity in shocks:
        a = SHOCK_ASSUMPTIONS[shock_type]
        sev = _severity_multiplier(severity)
        keep *= 1.0 - np.clip(a["exposure"] * sev, 0, 1)
        loss_raw += a["loss"] * sev
    p_exp = 1.0 - keep
    loss_frac = np.clip(loss_raw * (1 - 0.55 * resilience), 0, 0.95)

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


def _simulate_one(sub: pd.DataFrame, shock_type: str, severity: float, scale: float) -> dict:
    return _simulate_set(sub, [(shock_type, severity)], scale)


def simulate(
    district: str,
    shock_type: str,
    severity: float = 50.0,
    additional: list[dict] | None = None,
) -> dict:
    st = datastore.get()
    if district not in st["district_by_name"]:
        raise KeyError(district)
    if shock_type not in SHOCK_ASSUMPTIONS:
        raise KeyError(shock_type)

    extra = additional or []
    for item in extra:
        if item["shock_type"] not in SHOCK_ASSUMPTIONS:
            raise KeyError(item["shock_type"])

    d = st["district_by_name"][district]
    sub = st["households"][st["households"]["district"] == district]
    scale = d["households"] / max(len(sub), 1)

    shocks = [(shock_type, severity)] + [
        (i["shock_type"], i.get("severity", 50.0)) for i in extra
    ]
    main = _simulate_set(sub, shocks, scale)

    # Each shock on its own, so a reader can see which one moves the figure and by how much.
    components = [
        {
            "id": sid,
            "label": SHOCK_ASSUMPTIONS[sid]["label"],
            "severity": sev,
            "newly_poor_households": _simulate_one(sub, sid, sev, scale)["newly_poor_households"],
            "cash_need_rwf": _simulate_one(sub, sid, sev, scale)["cash_need_rwf"],
        }
        for sid, sev in shocks
    ]

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
        "shocks": [
            {"id": sid, "label": SHOCK_ASSUMPTIONS[sid]["label"], "severity": sev}
            for sid, sev in shocks
        ],
        "components": components,
        "combined": len(shocks) > 1,
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
