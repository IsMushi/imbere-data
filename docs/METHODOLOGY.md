# Method

This document states exactly how every number in IMBERE DATA is produced, so that a reviewer can
disagree with a specific step rather than with the whole tool.

---

## 1. The separation that matters

| Layer | Status | Where |
|---|---|---|
| District poverty (2024, 2017), rank | Published — EICV7 Annex B | `data/raw/district_poverty_eicv7.csv` |
| District population, household count | Published — Census 2022 | `data/raw/district_population_2022.csv` |
| Province / urban-rural poverty | Published — EICV7 Table 5.1 | `data/reference/national_indicators.json` |
| Poverty lines | Published — EICV7 §3.3 | same |
| Shock incidence, shock types, coping | Published — EICV7 Tables 6.10 / 6.11 | `data/reference/shocks.json` |
| Inclusion, financial health, climate exposure | Published — FinScope 2024 | `data/reference/national_indicators.json` |
| Household rows | **Synthetic, calibrated** | `data/processed/households.csv` |
| Risk model metrics | **Measured on synthetic rows** | API `/api/model` |
| Shock exposure / loss parameters | **Stated assumptions** | `api/app/analytics.py` |

The UI tags every panel with `Measured · published` or `Modelled · illustrative`.

---

## 2. Building the calibrated household layer

`scripts/build_data.py`. Seed `20261030`, 15,066 rows (mirrors the EICV7 sample size).

**Step 1 — draw households.** District sampled proportional to Census 2022 population. Urban
probability 0.88 in Kigali, 0.14 elsewhere. Household size Poisson(4)+1, clipped to 1–12.
Education and income source drawn from the published EICV7 marginal distributions
(Table 6.3 and Table 6.9, "All" columns).

**Step 2 — welfare score.**

```
score_i = logit(p_poor | education_i)
        + logit(p_poor | income_source_i)
        - 1.05 · urban_i
        + 0.06 · (size_i - 4)
```

Each `logit(p_poor | category)` is computed from the poverty rate EICV7 actually reports for that
category (e.g. 30.9% for no/below-primary education, 3.3% for upper secondary). The ordering the
model learns is therefore the ordering the survey reports, not an invention.

**Step 3 — assign poverty to match district headcounts exactly.**

Within each district, select exactly `k = round(n_d · rate_d / 100)` households, with probability

```
P(select_i) ∝ exp(α_d + β_e + γ_k + δ_i)
```

where `α_d` is fitted so the district total holds, `β_e` so the education-conditional rates hold,
and `γ_k` so the income-conditional rates hold; `δ_i` carries the urban and household-size effect.
Sampling is without replacement inside the district. Two properties matter:

- the district headcount equals the published rate to the nearest household (≤ 0.1 percentage
  point), for all 30 districts;
- selection is **stochastic**, not deterministic. A deterministic top-k would make poverty a
  function of education and income, and the risk model would score a meaningless AUC of 1.0.
  The fitted model yields a hold-out AUC of 0.857, above the 0.70–0.85 range reported for real
  proxy-means tests — because the published conditional gradients are sharper than a real
  survey's messier joint distribution. The direction, not the magnitude, is what survives
  contact with the microdata.

**Step 4 — consumption.** Poor households sit below the line with an exponential gap; non-poor
households sit strictly above it:

```
poor:      y = z · exp(-E),        E ~ Exponential(rate 3.58), clipped to [0.12, 1]
non-poor:  y = z · (1 + E),        E ~ Exponential(mean 0.50)
```

with `z = 560,127`. The rate 3.58 is calibrated so about 19.7% of poor households fall below the
extreme line (356,432), reproducing the published 5.4% national extreme-poverty headcount.

Non-poor households are generated strictly above the line. An earlier version drew them from an
untruncated lognormal, which silently double-counted extreme poverty (7.0% vs 5.4%).

**Step 5 — assets.** Each asset's poor/non-poor shares are the published EICV7 figures
(Tables 6.6–6.9). A Gaussian copula with ρ = 0.35 keeps assets correlated within a household:

```
z_asset = √ρ · z_latent + √(1-ρ) · ε
asset   = 1  if  z_asset < Φ⁻¹(p_asset | poverty status)
```

This hits the published marginals exactly while leaving the proxy-means test imperfect, as it is
in reality.

**Step 6 — shocks and coping.** Shock probability 41.0% for poor and 35.6% for non-poor households;
shock type and coping response drawn from the published category shares (Tables 6.10 / 6.11).

**Step 7 — financial health bands.** A resilience composite (consumption headroom, savings, mobile
money, insurance, asset depth) is ranked nationally and cut into the FinScope bands. The published
bands are 10 / 57 / 31 / 3, which sum to 101, so they are normalised by 101 before cutting.

### Calibration check

`data/processed/calibration.json`, regenerated on every build:

| Quantity | Target (published) | Achieved |
|---|---:|---:|
| Poverty headcount | 27.4% | 27.4% |
| Extreme poverty | 5.4% | 5.7% |
| Severe shock incidence | 37.1% | 37.1% |
| Shock incidence, poor | 41.0% | 41.1% |
| Mobile money ownership | 86.6% | 86.9% |
| Mobile money, poor | 77.8% | 77.8% |
| Savings account | 68.0% | 68.2% |
| Health insurance | 85.3% | 85.6% |
| Financial health 10/57/31/3 | 10 / 57 / 31 / 3 | 9.9 / 56.4 / 30.7 / 3.0 |

The population-weighted district table reconciles to **27.4%** nationally, matching the published
headcount — a useful check that the Annex B transcription is internally consistent.

---

## 3. Poverty-risk model

`api/app/datastore.py`.

- **Algorithm:** `HistGradientBoostingClassifier`, 250 iterations, learning rate 0.06, max depth 5,
  L2 = 1.0.
- **Target:** household is below the national poverty line.
- **Features:** district, province, head's education, main income source, urban, household size,
  11 asset/housing indicators, district poverty rate.
- **Excluded by design:** consumption. A proxy-means test must rank households on what an
  enumerator can observe, not on the welfare measure itself.
- **Split:** 70/30 stratified hold-out in the app; five-fold stratified out-of-fold in
  `scripts/evaluate_model.py`.
- **AUC:** 0.857 gradient boosting on the hold-out; across the recomputed candidate set, logistic
  0.860, random forest 0.852, gradient boosting 0.857 (ROC-AUC, out-of-fold).
- **Calibration:** Brier 0.134, ECE 0.006 for the shipped model; decile table in
  `docs/MODEL_EVALUATION.md`.
- **Importance:** permutation importance on the hold-out set, AUC loss, 5 repeats.

The logistic baseline scores marginally higher out-of-fold (0.860 vs. 0.857) and the difference is
inside noise at this sample size. Switching the shipped model would move every pinned targeting
figure for no measurable gain, so the comparison is reported rather than acted on. The evaluation
script is the authority: re-run it after any change to the household layer.

---

## 4. Targeting metrics

For a caseload of `k` households selected from `N`, with `P` poor households in the population:

| Metric | Definition |
|---|---|
| Targeting accuracy (precision) | `TP / k` |
| Coverage of the poor (recall) | `TP / P` |
| Leakage rate | `FP / k` |
| Exclusion error | `FN / P` |
| Cost per poor reached | `budget / TP` |

Selection rules (`api/app/analytics.py`):

| Rule | Priority score |
|---|---|
| Universal | uniform random |
| Geographic | district poverty rate + ε |
| Community-based | −(asset count) + ε |
| Financial-exclusion first | `0.6·(no mobile money) + 0.4·(no savings) + 0.5·risk` |
| Proxy-means | model predicted probability |

The coverage curve re-runs selection at caseloads of 5–50% to show how each rule degrades as
targeting gets harder.

**Geographic fairness.** Coverage alone can be bought by concentrating the caseload. For each rule
the engine reports the number of districts reached, the share of beneficiaries placed in the ten
poorest districts, and a ratio:

```
fairness_ratio = (share of beneficiaries in the ten poorest districts)
               / (share of all poor households living in those districts)
```

`1.0` is proportional, above `1.0` concentrates. At the default budget geographic targeting reaches
5 districts with a ratio of 2.09, proxy-means reaches 28 with 1.32, and universal allocation reaches
all 30 with 0.68. The ratio is a descriptive statistic of the allocation, not a normative judgement
about which concentration is acceptable.

**Bootstrap intervals.** Each headline figure is reported with a 95% interval from 200 resamples of
the household sample, re-ranking the same score vector. The interval captures sampling variability
of the synthetic sample only — not the EICV7 sampling design, not non-sampling error, and not the
uncertainty in the calibration itself. It is a floor on the uncertainty, not a measure of it.

---

## 5. Shock simulator

For district `d`, shock `s`, severity `v ∈ [0,100]`:

```
m(v)      = 0.2 + 0.016 · v                     severity multiplier (0.2× at 0, 1.8× at 100)
p_exp     = clip(E_s · m(v), 0, 1)              probability a household is exposed
λ         = clip(L_s · m(v) · (1 − 0.55·r), 0, 0.95)   consumption loss, r = resilience index / 100
y'        = y · (1 − λ)                         consumption after the shock
```

Aggregates (expected values, no simulation noise):

```
Newly poor households = Σ p_exp,i · 1(y_i ≥ z and y'_i < z)
Poverty rate after    = [ Σ p_exp,i · 1(y'_i < z) + Σ 1(y_i < z) ] / N
Cash need             = Σ p_exp,i · max(0, z − y'_i) · h_i
```

where `h_i` is household size (adult-equivalent units approximated by household size — stated, not
estimated). Counts are scaled from the district sample to the district's real household count
(Census 2022 population ÷ 4.3).

`E_s` and `L_s` are **assumptions**, visible in the UI and in code:

| Shock | Base exposure | Calibrated exposure | Loss at severity 100 |
|---|---:|---:|---:|
| Drought | 0.35 | 0.076 | 0.28 |
| Flood / downpour | 0.30 | 0.065 | 0.35 |
| Storm / landslide | 0.20 | 0.043 | 0.18 |
| Crop pest | 0.25 | 0.054 | 0.22 |
| Health | 0.15 | 0.033 | 0.30 |
| Food price spike | 0.60 | 0.130 | 0.12 |
| Income loss | 0.20 | 0.043 | 0.25 |

The base exposures are published as relative burdens; a single scalar (0.2171) is solved so that
the probability a household is hit by at least one of the seven shocks equals the published
37.1% severe-shock incidence, assuming independence across shock types. Without that
calibration the base values alone would imply 92.6%. The split between shock types and the loss
rates are stated assumptions, not EICV7 estimates; calibrating them against the EICV7 shock
module and district-level rainfall or production data is the first extension once microdata
access is granted.

### Compound scenarios

A request may carry up to six `additional_shocks`. For shocks `j = 1…J` applied to the same
households in the same period:

```
p_exposure = 1 − ∏ⱼ (1 − clip(Eⱼ · m(vⱼ), 0, 1))
λ          = clip( Σⱼ Lⱼ · m(vⱼ) · (1 − 0.55·r), 0, 0.95 )
```

Exposure combines independently; losses add before resilience absorbs them. With one shock this
reduces exactly to the single-shock formula above, which is why the documented single-shock figures
did not move. The response also runs each shock alone so the combined figure can be attributed. The
combined count is at least as large as either component but smaller than their sum, because a
household already below the line cannot cross it again.

---

## 6. Replacing synthetic rows with real microdata

The engines are agnostic to where rows come from. To swap:

1. Register on the NISR microdata portal (<https://microdata.statistics.gov.rw/index.php/catalog>),
   then request **EICV7 cross-sectional** (`catalog/119`, cross-sectional sample) and the **VUP
   module** (`catalog/121`) through *Get Microdata* on each study page. Two portal quirks, per the
   organisers' access guide: the sign-up confirmation email never arrives, so log in directly with
   the credentials you set; and public-use studies are normally released as soon as the request form
   is submitted, so the delay is the form, not an approval queue.
2. Map the EICV7 household file to the column contract in `data/processed/households.csv`:

   | Column | EICV7 concept |
   |---|---|
   | `district` | district identifier |
   | `urban` | urban/rural residence |
   | `hh_size` | household size |
   | `head_education` | highest education completed by head |
   | `main_income_source` | main income source of head |
   | `modern_floor`, `electricity`, `corrugated_roof`, `improved_sanitation` | housing module |
   | `owns_tv`, `owns_radio`, `owns_phone`, `owns_bicycle` | durable goods module |
   | `health_insurance` | health module |
   | `has_momo`, `has_savings` | financial services module |
   | `shock_experienced`, `shock_type`, `coping_response` | shock module |
   | `consumption_ae` | consumption aggregate per adult equivalent, January 2024 prices |
   | `poor`, `extreme_poor` | against the 560,127 / 356,432 lines |

3. Replace the file and restart. `datastore.py` refits the model on load; nothing else changes.
   Keep the extract itself out of git: NISR/AFR release row-level data for analysis, not
   redistribution, and `.gitignore` blocks `.dta` / `.sav` / `.por` / `.zip` under `data/raw`.
   Committing an EICV7 extract is a licence breach; committing the derived `households.csv` is not,
   provided the swap is documented.
4. Delete `scripts/build_data.py` from the pipeline — it exists only to bridge the gap.

`households.csv` is deliberately a flat, human-readable contract rather than a bespoke format, so
this substitution is a file swap rather than a refactor.

---

## 7. Limitations — read before quoting any figure

- **Synthetic household rows.** `households.csv` is calibrated, not observed. Marginals match
  published EICV7 figures; the joint distribution is generated. The engines do not change when
  real microdata is loaded — only the rows they read — but the figures above are prototype
  figures, not Rwanda's.
- **Conditional gradients are published but rounded.** Table 6.3 prints poverty rates of
  30.9 / 17.8 / 9.0 / 3.3 / 0.0 by education. Those columns do not reconcile to the 27.4%
  headcount; the rates implied by its own poor / non-poor columns are 35.6 / 21.2 / 11.0 / 4.1 /
  0.0. We use the implied version so the model learns a gradient consistent with the table's
  composition. Table 6.9 has the same issue for income (we use the implied 51.0 / 19.2 / 27.3 /
  13.9 / 24.4, not the printed poor-share column).
- **NISR inconsistencies carried as-is.** East 2017 = 39.2 (Table 5.1) vs 39.1 (Table 0.1);
  Table 5.1 prints East's extreme-poverty change as "9" (minus sign lost); Table 6.7's
  modern-floor "All" of 39.2 contradicts its own columns (37.9). We transcribe what is printed.
- **Phone ownership is converted.** Table 6.8 reports phones per person aged 10+ (48.9%). The
  household-level feature uses 1 − (1 − p_person)^3.0, assuming independence and 3.0 eligible
  members per household.
- **Shock parameters are assumptions.** Exposures are scaled to reproduce the 37.1% incidence;
  the split between shock types and the loss rates are stated, not estimated. Loss rates are
  not calibrated to the EICV7 shock module or to rainfall / production data.
- **No causal claim.** The tools measure selection performance, not programme impact.
- **No uncertainty beyond the bootstrap.** The 95% intervals capture sampling variability of the
  synthetic sample only. No survey weights, strata or PSUs exist, so design-based standard errors
  are not available.
- **The shipped model is not the CV winner.** Logistic regression scores 0.860 out-of-fold against
  0.857 for the gradient-boosted model. The gap is inside noise and switching would move every
  pinned targeting figure, so the comparison is reported in `docs/MODEL_EVALUATION.md` rather than
  acted on.

---

## 8. Reproducing every number

```bash
python scripts/build_data.py          # regenerates processed data + calibration.json
python scripts/build_snapshot.py      # rewrites web/public/api/*.json
python scripts/build_snapshot.py --check   # fails if the snapshot has drifted
python scripts/evaluate_model.py      # rewrites docs/MODEL_EVALUATION.md
cd api && python -m pytest tests -q   # engines, model card, contract, cold start, HTTP
cd web && npm run build               # TypeScript + static prerender
```

`api/tests/` asserts the documented figures rather than printing them, so drift fails instead of
scrolling past. The browser checks are described in `docs/TESTING_REPORT.md`; they are local-only
harnesses, not part of the committed suite.

---

## 9. Poverty measures (FGT)

Foster–Greer–Thorbecke, computed on the calibrated household layer with household size as the
per-capita weight:

```
P(α) = (1 / W) · Σᵢ wᵢ · [ max(0, (z − yᵢ) / z) ]^α
```

| α | Measure | What it answers |
|---|---|---|
| 0 | Headcount | What share of people are below the line |
| 1 | Poverty gap | How far below, on average, as a share of the line |
| 2 | Severity | The same, squared — weights the poorest more heavily |

`z = 560,127` RWF per adult equivalent per year (extreme line `356,432`). Computed nationally, by
urban/rural and for all 30 districts. A household-size-weighted Gini is reported alongside.

Computed values at the current calibration: headcount **27.58%**, gap **6.03%**, severity
**2.18%**, extreme headcount **5.72%**, Gini **0.218**. The published headcount is 27.4%; the
difference is the calibration target versus the realised sample, not an independent estimate.

**Weighting caveat.** `wᵢ` is household size, which is the correct weight for a per-capita measure
computed from per-adult-equivalent consumption *given this file*. It is not an EICV7 survey weight:
the synthetic layer has no sampling design, strata or primary sampling units, so these are
descriptive statistics about the prototype, not design-based national estimates. The `/methodology`
page says this next to the numbers.

---

## 10. What would change the conclusions

Being explicit about fragility strengthens the work, so:

- **If real microdata shows lower asset–poverty separation**, proxy-means accuracy falls and the
  gap to geographic targeting narrows. The policy conclusion would shift toward geographic
  targeting plus community validation.
- **If shock parameters are wrong**, the cash-need figures move roughly linearly. The *ranking* of
  shocks is more robust than the levels.
- **If district poverty estimates are revised**, the map changes but the targeting engine does not.
- **VUP data would allow the missing piece**: actual programme impact rather than selection
  performance. That is the natural next iteration — comparing outcomes for VUP recipients against
  matched non-recipients within the same district.
