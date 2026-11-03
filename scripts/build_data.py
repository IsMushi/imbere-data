"""
Build IMBERE DATA's processed data layer.

Two very different kinds of data live here and the code keeps them strictly apart:

  REAL      district poverty rates (EICV7 Annex B), district populations (Census 2022),
            national indicators (EICV7 / FinScope 2024), shock prevalence and coping
            responses (EICV7 Tables 6.10 / 6.11). Transcribed, never modelled.

  CALIBRATED  a synthetic household microdata file. It exists so the targeting lab and the
            risk model have household-level rows to work with before NISR microdata access
            is granted. Every marginal it reproduces is a published EICV7 figure; the
            joint distribution is synthetic. It is labelled as such everywhere it surfaces.

Run:  python scripts/build_data.py
"""
from __future__ import annotations

import json
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REF = ROOT / "data" / "reference"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

# Round identity. Everything that changes when the survey round changes - the seed, the sample
# size, the average household size and the published national headline rates - lives in
# data/reference/round.json so a new EICV round is a config edit rather than a scatter of edits.
# The poverty lines are not duplicated here: they are read from national_indicators.json, which is
# the same file the API publishes them from.
ROUND = json.loads((REF / "round.json").read_text(encoding="utf-8"))
NATIONAL_INDICATORS = json.loads((REF / "national_indicators.json").read_text(encoding="utf-8"))

# EICV7 poverty lines, January 2024 prices.
POVERTY_LINE = float(NATIONAL_INDICATORS["poverty_lines"]["total_poverty_line_rwf_per_adult_equiv_year"])
EXTREME_LINE = float(
    NATIONAL_INDICATORS["poverty_lines"]["extreme_poverty_line_rwf_per_adult_equiv_year"]
)
AVG_HH_SIZE = float(ROUND["average_household_size"])  # Census 2022 average household size
SEED = int(ROUND["seed"])
N_HOUSEHOLDS = int(ROUND["sample_households"])  # mirrors the EICV7 cross-sectional sample size

# --------------------------------------------------------------------------------------
# Real: district poverty (EICV7 Annex B) + population (Census 2022)
# --------------------------------------------------------------------------------------
pov = pd.read_csv(RAW / "district_poverty_eicv7.csv")
pop = pd.read_csv(RAW / "district_population_2022.csv")
d = pov.merge(pop, on="district", how="left", validate="one_to_one")

d["poverty_change_pp"] = (d["poverty_2024"] - d["poverty_2017"]).round(1)
d["households"] = (d["population_2022"] / AVG_HH_SIZE).round().astype(int)
d["poor_people"] = (d["population_2022"] * d["poverty_2024"] / 100).round().astype(int)
d["poor_households"] = (d["households"] * d["poverty_2024"] / 100).round().astype(int)
# A district where poverty fell by less than 5 points is flagged "stalled" - the report
# notes only 17 of 30 districts had a statistically significant reduction.
d["stalled_progress"] = d["poverty_change_pp"] > -5.0

d = d.sort_values("poverty_2024", ascending=False).reset_index(drop=True)

districts = d[
    [
        "district",
        "province",
        "poverty_2017",
        "poverty_2024",
        "poverty_change_pp",
        "poverty_rank_2024",
        "population_2022",
        "households",
        "poor_people",
        "poor_households",
        "stalled_progress",
    ]
].to_dict(orient="records")

national = NATIONAL_INDICATORS
shocks = json.loads((REF / "shocks.json").read_text(encoding="utf-8"))

# Sample-weighted national poverty implied by the district rates. Reported so the reader can
# see how closely the district table reconciles to the published 27.4% national headcount.
w = d["population_2022"]
implied_national = float((w * d["poverty_2024"]).sum() / w.sum())

meta = {
    "country": "Rwanda",
    "round": {
        "id": ROUND["round"],
        "fieldwork": ROUND["fieldwork"],
        "published": ROUND["published"],
        "sample_households": N_HOUSEHOLDS,
        "note": ROUND["note"],
    },
    "poverty_lines": national["poverty_lines"],
    "national": {
        "population_2022": int(d["population_2022"].sum()),
        "households": int(d["households"].sum()),
        "poor_people": int(d["poor_people"].sum()),
        "poor_households": int(d["poor_households"].sum()),
        "poverty_rate_2024": ROUND["headline"]["poverty_rate_2024"],
        "extreme_poverty_rate_2024": ROUND["headline"]["extreme_poverty_rate_2024"],
        "poverty_rate_2017": ROUND["headline"]["poverty_rate_2017"],
        "extreme_poverty_rate_2017": ROUND["headline"]["extreme_poverty_rate_2017"],
        "district_weighted_poverty_rate": round(implied_national, 2),
    },
    "districts_count": int(len(d)),
    "sources": national["sources"],
    "indicators": national["indicators"],
    "province_poverty": national["province_poverty"],
    "area_poverty": national["area_poverty"],
    "shocks": shocks,
    "microdata": {
        "kind": "calibrated_synthetic",
        "rows": N_HOUSEHOLDS,
        "seed": SEED,
        "note": (
            "Household-level rows are synthetic. Marginals are calibrated to published EICV7 "
            "figures (Tables 6.3, 6.6-6.11); the joint distribution is not observed data. "
            "Replace with the EICV7 microdata file via the loader in api/app/datastore.py."
        ),
    },
}

(OUT / "districts.json").write_text(json.dumps(districts, indent=2), encoding="utf-8")
(OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

# --------------------------------------------------------------------------------------
# Calibrated synthetic households
# --------------------------------------------------------------------------------------
rng = np.random.default_rng(SEED)

# Published marginal distributions (EICV7 Table 6.3 / 6.9 "All" columns).
EDU_LEVELS = ["none_below_primary", "primary", "lower_secondary", "upper_secondary", "university"]
EDU_SHARE = np.array([0.592, 0.253, 0.041, 0.063, 0.050])
EDU_SHARE = EDU_SHARE / EDU_SHARE.sum()
# Poverty rate by education completed (Table 6.3). Like Table 6.9, that table does not print a rate
# the composition columns agree with: it prints 30.9 / 17.8 / 9.0 / 3.3 / 0.0, but the poor and
# non-poor columns imply 35.6 / 21.2 / 11.0 / 4.1 / 0.0, and only the implied version reconciles
# to the 27.4% national headcount. Derived with the same identity as INCOME_POVERTY below:
#     rate_g = (poor_share_g * P_poor) / (poor_share_g * P_poor + non_poor_share_g * P_non_poor)
# The university cell prints 0.0; 0.001 keeps the log-odds finite without contradicting "0.0%".
EDU_POVERTY = np.array([0.356, 0.212, 0.110, 0.041, 0.001])

INCOME_LEVELS = ["farm_wages", "nonfarm_wages", "independent_farmer", "independent_nonfarmer", "other"]
INCOME_SHARE = np.array([0.165, 0.275, 0.411, 0.142, 0.006])
INCOME_SHARE = INCOME_SHARE / INCOME_SHARE.sum()
# Poverty rate by main income source, implied from Table 6.9. That table does not print the rate
# directly: it splits each source across the poor and non-poor columns, so the rate for source s is
#     (poor_share_s * P_poor) / (poor_share_s * P_poor + non_poor_share_s * P_non_poor)
# with P_poor = 0.274 / P_non_poor = 0.726 from Table 5.1. Using the poor-share column directly (the
# earlier mistake) put independent farmers above farm-wage households, inverting the real gradient.
INCOME_POVERTY = np.array([0.510, 0.192, 0.273, 0.139, 0.244])

n = N_HOUSEHOLDS
district_names = d["district"].to_numpy()
district_weights = (d["population_2022"] / d["population_2022"].sum()).to_numpy()
district_rate = dict(zip(d["district"], d["poverty_2024"]))
district_prov = dict(zip(d["district"], d["province"]))

hh_district = rng.choice(district_names, size=n, p=district_weights)
hh_province = np.array([district_prov[x] for x in hh_district])

# Urban share: Kigali is overwhelmingly urban, other provinces mostly rural (Census 2022:
# 28% of the population urban nationally).
urban_p = np.where(hh_province == "Kigali City", 0.88, 0.14)
hh_urban = rng.random(n) < urban_p

# Household size: right-skewed around the 4.3 national average.
hh_size = rng.poisson(4.0, n) + 1
hh_size = np.clip(hh_size, 1, 12)

hh_edu_idx = rng.choice(len(EDU_LEVELS), size=n, p=EDU_SHARE)
hh_income_idx = rng.choice(len(INCOME_LEVELS), size=n, p=INCOME_SHARE)

# Poverty assignment. Three published facts must hold at once:
#   1. every district's headcount equals its EICV7 rate exactly;
#   2. poverty falls with the head's education, at the published rates;
#   3. poverty falls with the income source, at the published rates.
# A per-district top-k on an additive score satisfies (1) but smears (2) and (3), because the
# sampling temperature trades precisely the gradient it should preserve. Instead the selection
# probability is a log-linear model
#       P(poor | district, education, income) = sigmoid(alpha_d + beta_e + gamma_k + delta)
# whose offsets are fitted by iterative proportional fitting: alpha_d for the district quotas,
# beta_e and gamma_k for the published conditional rates. The fit is then realised by sampling
# exactly k_d households inside each district, so (1) stays exact and (2), (3) are met up to
# sampling noise. delta carries the urban and household-size effects and is not constrained.
def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def fit_offset(base: np.ndarray, membership: np.ndarray, target: float) -> float:
    """Solve sum(base[membership] + offset) = target by bisection. Monotone, so this converges."""
    lo, hi = -40.0, 40.0
    for _ in range(200):
        mid = (lo + hi) / 2.0
        if sigmoid(base[membership] + mid).sum() < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


district_list = list(dict.fromkeys(hh_district))
district_idx = np.array([district_list.index(x) for x in hh_district])
district_target = np.array([
    round((hh_district == name).sum() * district_rate[name] / 100.0) for name in district_list
], dtype=float)

alpha = np.array([np.log(max(district_rate[x] / 100.0, 1e-3) / (1 - max(district_rate[x] / 100.0, 1e-3)))
                  for x in district_list])
beta = np.zeros(len(EDU_LEVELS))
gamma = np.zeros(len(INCOME_LEVELS))
base_delta = -0.45 * hh_urban + 0.04 * (hh_size - 4)

for _ in range(400):
    eta = alpha[district_idx] + beta[hh_edu_idx] + gamma[hh_income_idx] + base_delta
    for e in range(len(EDU_LEVELS)):
        m = hh_edu_idx == e
        target = m.sum() * EDU_POVERTY[e]
        new = fit_offset(eta - beta[e], m, target)
        eta[m] += new - beta[e]
        beta[e] = new
    for k in range(len(INCOME_LEVELS)):
        m = hh_income_idx == k
        target = m.sum() * INCOME_POVERTY[k]
        new = fit_offset(eta - gamma[k], m, target)
        eta[m] += new - gamma[k]
        gamma[k] = new
    for j in range(len(district_list)):
        m = district_idx == j
        new = fit_offset(eta - alpha[j], m, district_target[j])
        eta[m] += new - alpha[j]
        alpha[j] = new

prob = sigmoid(alpha[district_idx] + beta[hh_edu_idx] + gamma[hh_income_idx] + base_delta)
poor = np.zeros(n, dtype=bool)
for j, name in enumerate(district_list):
    idx = np.where(district_idx == j)[0]
    k = int(district_target[j])
    if k <= 0:
        continue
    w = prob[idx]
    chosen = rng.choice(idx, size=min(k, len(idx)), replace=False, p=w / w.sum())
    poor[chosen] = True

# Consumption per adult equivalent. Poor households sit below the line, with a left tail deep
# enough to reproduce the 5.4% extreme poverty headcount; non-poor households sit above it.
cons = np.empty(n)
gap_lambda = 3.58  # calibrated so ~19.7% of poor households fall below the extreme line
poor_idx = np.where(poor)[0]
nonpoor_idx = np.where(~poor)[0]
gap = np.exp(-rng.exponential(1 / gap_lambda, size=len(poor_idx)))
gap = np.clip(gap, 0.12, 1.0)
cons[poor_idx] = POVERTY_LINE * gap
# Non-poor households must sit above the line by construction, otherwise the extreme-poverty
# headcount double-counts them. Exponential headroom keeps the right skew of the distribution.
cons[nonpoor_idx] = POVERTY_LINE * (1.0 + rng.exponential(0.50, size=len(nonpoor_idx)))
cons = np.maximum(cons, 20_000)

extreme_poor = cons < EXTREME_LINE

# Assets. Shares are the published poor / non-poor splits (EICV7 Tables 6.6-6.9). A shared
# latent propensity keeps assets correlated within a household the way real asset ownership
# is; the independent component keeps the proxy-means test from being unrealistically sharp.
#
# Table 6.8 reports phone ownership "per person aged 10 or older" (48.9% overall, 34.0% poor /
# 55.2% non-poor), not household ownership. Treating that rate as a household share understates
# it. Converted here under an independence assumption: with 3.0 members aged 10+ per household on
# average, a household has at least one phone with probability 1 - (1 - p_person)^3.0, giving
# 71.3% poor / 91.0% non-poor. The conversion is an assumption and is stated as one.
PHONE_ADULTS = 3.0


def _hh_from_person(p_person: float) -> float:
    return 1.0 - (1.0 - p_person) ** PHONE_ADULTS


ASSETS = {
    "modern_floor": (0.145, 0.468),
    "electricity": (0.552, 0.771),
    "corrugated_roof": (0.666, 0.786),
    "improved_sanitation": (0.894, 0.959),
    "owns_tv": (0.036, 0.275),
    "owns_radio": (0.427, 0.678),
    "owns_phone": (_hh_from_person(0.340), _hh_from_person(0.552)),
    "owns_bicycle": (0.116, 0.221),
    "health_insurance": (0.766, 0.886),
    "has_momo": (0.778, 0.903),
    "has_savings": (0.532, 0.744),
}
latent_z = rng.standard_normal(n)
RHO = 0.35  # cross-asset correlation
nd = NormalDist()
assets = {}
for key, (p_poor, p_non) in ASSETS.items():
    # Gaussian copula: z stays standard normal, so P(asset=1) hits the published share exactly
    # while assets remain correlated within a household.
    z = np.sqrt(RHO) * latent_z + np.sqrt(1 - RHO) * rng.standard_normal(n)
    threshold = np.where(poor, nd.inv_cdf(p_poor), nd.inv_cdf(p_non))
    assets[key] = (z < threshold).astype(int)

# Shock exposure and coping (EICV7 Tables 6.10 / 6.11).
shock_p = np.where(poor, 0.410, 0.356)
had_shock = rng.random(n) < shock_p
shock_ids = [s["id"] for s in shocks["shock_types"]]
shock_all = np.array([s["all"] for s in shocks["shock_types"]], dtype=float)
shock_all = shock_all / shock_all.sum()
shock_type = np.where(had_shock, rng.choice(shock_ids, size=n, p=shock_all), "none")

cope_ids = [c["id"] for c in shocks["coping_responses"]]
cope_poor = np.array([c["poor"] for c in shocks["coping_responses"]], dtype=float)
cope_poor = cope_poor / cope_poor.sum()
cope_non = np.array([c["non_poor"] for c in shocks["coping_responses"]], dtype=float)
cope_non = cope_non / cope_non.sum()
coping = np.where(
    had_shock,
    np.where(poor, rng.choice(cope_ids, size=n, p=cope_poor), rng.choice(cope_ids, size=n, p=cope_non)),
    "none",
)

# Resilience / financial health. Composite of consumption headroom, liquid accounts, insurance
# and asset depth. Ranked nationally so the four FinScope financial-health bands come out at
# the published 3 / 31 / 57 / 10 split.
buffer = np.log(cons / POVERTY_LINE)
asset_depth = sum(assets.values())
resilience = (
    0.55 * buffer
    + 0.20 * assets["has_savings"]
    + 0.12 * assets["has_momo"]
    + 0.08 * assets["health_insurance"]
    + 0.05 * (asset_depth / len(ASSETS))
)
resilience = (resilience - resilience.min()) / (resilience.max() - resilience.min()) * 100
order = np.argsort(resilience)
health = np.empty(n, dtype=object)
# Published FinScope bands are 3 / 31 / 57 / 10, which sum to 101 - normalise them.
shares = np.array([3.0, 31.0, 57.0, 10.0]) / 101.0
n_ext = int(round(shares[0] * n))
n_vuln = int(round(shares[1] * n))
n_cope = int(round(shares[2] * n))
health[order[:n_ext]] = "extremely_vulnerable"
health[order[n_ext : n_ext + n_vuln]] = "vulnerable"
health[order[n_ext + n_vuln : n_ext + n_vuln + n_cope]] = "coping"
health[order[n_ext + n_vuln + n_cope :]] = "healthy"

hh = pd.DataFrame(
    {
        "hh_id": [f"HH{i:06d}" for i in range(n)],
        "district": hh_district,
        "province": hh_province,
        "urban": hh_urban.astype(int),
        "hh_size": hh_size,
        "head_education": np.array(EDU_LEVELS)[hh_edu_idx],
        "main_income_source": np.array(INCOME_LEVELS)[hh_income_idx],
        **assets,
        "shock_experienced": had_shock.astype(int),
        "shock_type": shock_type,
        "coping_response": coping,
        "consumption_ae": cons.round(0),
        "poor": poor.astype(int),
        "extreme_poor": extreme_poor.astype(int),
        "resilience_index": resilience.round(2),
        "financial_health": health,
    }
)
hh.to_csv(OUT / "households.csv", index=False)

# --------------------------------------------------------------------------------------
# Calibration report - printed so drift is visible rather than silent
# --------------------------------------------------------------------------------------
def pct(mask: pd.Series) -> float:
    return round(100 * mask.mean(), 1)

report = {
    "poverty_rate": pct(hh["poor"] == 1),
    "extreme_poverty_rate": pct(hh["extreme_poor"] == 1),
    "shock_incidence": pct(hh["shock_experienced"] == 1),
    "shock_incidence_poor": pct(hh.loc[hh.poor == 1, "shock_experienced"] == 1),
    "momo_ownership": pct(hh["has_momo"] == 1),
    "momo_poor": pct(hh.loc[hh.poor == 1, "has_momo"] == 1),
    "savings_ownership": pct(hh["has_savings"] == 1),
    "health_insurance": pct(hh["health_insurance"] == 1),
    "modern_floor": pct(hh["modern_floor"] == 1),
    "financial_health": {k: pct(hh["financial_health"] == k) for k in
                          ["healthy", "coping", "vulnerable", "extremely_vulnerable"]},
}
(OUT / "calibration.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

print("districts:", len(districts), "| households:", n)
print("implied national poverty from district table:", round(implied_national, 2), "%")
print(json.dumps(report, indent=2))
