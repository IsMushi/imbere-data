# Data dictionary

Field-level reference for every file the running system reads or serves. Types are the logical
types after loading; the CSV stores everything as text.

## 1. `data/raw/district_poverty_eicv7.csv` — observed

30 rows, transcribed from EICV7 Annex B.

| Column | Type | Unit | Description |
|---|---|---|---|
| `district` | string | — | District name, matching the official list |
| `province` | string | — | Kigali / North / South / East / West |
| `poverty_2017` | float | % | Headcount poverty rate, EICV5/6 comparable series |
| `poverty_2024` | float | % | Headcount poverty rate, EICV7 |
| `poverty_rank_2024` | int | rank | 1 = lowest poverty rate |

## 2. `data/raw/district_population_2022.csv` — observed

| Column | Type | Unit | Description |
|---|---|---|---|
| `district` | string | — | District name |
| `population_2022` | int | persons | Census 2022 district population |

Household counts are derived at build time from population and the published national average
household size, and written to `districts.json`.

## 3. `data/processed/households.csv` — synthetic, calibrated

15,066 rows, seed 20261030. Marginals calibrated to published EICV7 / FinScope figures; the joint
distribution is **not** observed. `microdata_kind = calibrated_synthetic`.

| Column | Type | Unit / values | Source of the marginal |
|---|---|---|---|
| `hh_id` | string | `HH000000`… | Generated |
| `district` | string | 30 districts | Census population weights |
| `province` | string | 5 provinces | Derived from district |
| `urban` | 0/1 | — | EICV7 urban/rural split |
| `hh_size` | int | persons | EICV7 mean household size |
| `head_education` | category | `none`, `primary`, `secondary`, `tertiary` | EICV7 education distribution |
| `main_income_source` | category | `farm`, `nonfarm_wages`, `self_employment`, `transfers`, `other` | EICV7 income-source distribution |
| `modern_floor` | 0/1 | — | EICV7 asset ownership |
| `electricity` | 0/1 | — | EICV7 asset ownership |
| `corrugated_roof` | 0/1 | — | EICV7 asset ownership |
| `improved_sanitation` | 0/1 | — | EICV7 asset ownership |
| `owns_tv` | 0/1 | — | EICV7 asset ownership |
| `owns_radio` | 0/1 | — | EICV7 asset ownership |
| `owns_phone` | 0/1 | — | EICV7 asset ownership |
| `owns_bicycle` | 0/1 | — | EICV7 asset ownership |
| `health_insurance` | 0/1 | — | EICV7 / FinScope insurance coverage |
| `has_momo` | 0/1 | — | FinScope mobile-money ownership |
| `has_savings` | 0/1 | — | FinScope savings ownership |
| `shock_experienced` | 0/1 | — | EICV7 shock incidence (37.1%) |
| `shock_type` | category | `none`, `drought`, `flood`, `storm`, `pest`, `health`, `food_price`, `income_loss` | EICV7 Tables 6.10–6.11 |
| `coping_response` | category | `none`, `savings`, `borrowing`, `asset_sale`, `family_support`, `insurance` | EICV7 coping distribution |
| `consumption_ae` | float | RWF per adult equivalent per year, Jan 2024 prices | Calibrated to the published poverty rates and lines |
| `poor` | 0/1 | — | `consumption_ae < 560,127` |
| `extreme_poor` | 0/1 | — | `consumption_ae < 356,432` |
| `resilience_index` | float | 0–100 | Constructed composite: savings, insurance, mobile money, asset base |
| `financial_health` | category | `healthy`, `coping`, `vulnerable`, `extremely_vulnerable` | FinScope 2024 segment shares |

`resilience_index` is a composite built here, not an official statistic. The four
`financial_health` shares are calibrated to FinScope; the assignment of a segment to a row is
modelled.

## 4. `data/processed/districts.json` — derived

Array of 30 objects.

| Field | Type | Unit | Derivation |
|---|---|---|---|
| `district`, `province` | string | — | Published |
| `poverty_2017`, `poverty_2024` | float | % | Published |
| `poverty_change_pp` | float | percentage points | `poverty_2024 − poverty_2017` |
| `poverty_rank_2024` | int | rank | Published rank (1 = lowest) |
| `population_2022` | int | persons | Published |
| `households` | int | households | Population ÷ published average household size |
| `poor_people` | int | persons | `population_2022 × poverty_2024 / 100` |
| `poor_households` | int | households | `households × poverty_2024 / 100` |
| `stalled_progress` | boolean | — | Poverty fell by less than the national change, or rose |

## 5. `data/processed/meta.json` — observed + generated metadata

| Key | Content |
|---|---|
| `country` | `Rwanda` |
| `poverty_lines` | Total and extreme line in RWF per adult equivalent per year, price base |
| `national` | Population, households, poor people, poor households, headcount 2024/2017, extreme rates |
| `districts_count` | 30 |
| `sources` | Registry rows (id, title, publisher, year, url, licence) |
| `indicators` | 39 transcribed indicators with value, unit, year, source id, group |
| `province_poverty`, `area_poverty` | Published province and urban/rural series |
| `shocks` | Shock incidence (all/poor/non-poor), seven shock types, six coping responses, FinScope climate block |
| `microdata` | `kind`, `rows`, `seed`, `note` — the synthetic contract |
| `model_card`, `calibration` | Injected by `/api/meta` from `datastore` and `calibration.json` |
| `targeting_rules`, `shock_assumptions`, `severity_note` | Injected by `/api/meta` from `analytics` |

## 6. `data/processed/calibration.json` — targets

The nine published marginals the synthetic layer is calibrated to, kept separate so a reviewer can
compare them to the generated shares without reading the generator.

## 7. `data/processed/model_evaluation.json` — generated

| Key | Content |
|---|---|
| `evaluated_on`, `rows`, `folds`, `seed`, `caseload` | Protocol |
| `models.<name>` | `roc_auc`, `pr_auc`, `brier`, `ece`, `at_programme_caseload` (precision, recall, F1, confusion counts), `calibration` deciles |
| `best_model`, `production_model` | CV winner vs. what the app ships |
| `robustness` | AUC target, achieved AUC, accuracy, coverage, leakage, `still_beats_geographic` |
| `reference` | Geographic and universal outcomes on the same sample |
| `caveat` | Synthetic-data statement |

## 8. API response fields

### `GET /api/poverty`

| Field | Type | Unit | Note |
|---|---|---|---|
| `national.headcount_pct` | float | % | P₀ at the total line |
| `national.poverty_gap_pct` | float | % of line | P₁ |
| `national.severity_pct` | float | % of line² | P₂ |
| `national.headcount_extreme_pct` | float | % | P₀ at the extreme line |
| `national.mean_consumption_ae_rwf`, `median_…` | int | RWF/year | Household-size weighted |
| `national.gini_consumption` | float | 0–1 | Weighted Gini |
| `by_area[]` | array | — | Urban and rural P₀/P₁/P₂ |
| `districts[]` | array | — | Per-district P₀/P₁/P₂ plus `published_headcount` for comparison |
| `weights`, `scope`, `note`, `microdata_kind` | string | — | Provenance |

### `POST /api/targeting`

Request: `budget_total` (RWF, > 0), `transfer_per_beneficiary` (RWF, > 0), `rules` (optional list of
ids). Response:

| Field | Type | Unit |
|---|---|---|
| `results[].targeting_accuracy` | float | % of beneficiaries who are poor |
| `results[].coverage_of_poor` | float | % of poor households reached |
| `results[].leakage_rate` | float | % of beneficiaries who are non-poor |
| `results[].exclusion_error` | float | % of poor households missed |
| `results[].cost_per_poor_reached` | int | RWF per poor household |
| `results[].ci95` | object | 95% bootstrap interval per metric |
| `fairness.<rule>` | object | `districts_reached`, `share_to_poorest_decile`, `fairness_ratio` |
| `coverage_curve[]` | array | Poor reached by caseload at 5–50% |
| `bootstrap_reps`, `sample_households`, `total_poor_in_sample` | int | Protocol |

### `POST /api/simulate`

Request: `district`, `shock_type`, `severity` (0–100), `additional_shocks[]` (≤ 6, each with
`shock_type` and `severity`). Response: `shocks[]`, `components[]` (each shock alone),
`combined` (boolean), `result` (exposed, newly poor, newly extreme, below line after, poverty rate
before/after, mean consumption loss, cash need), `compare[]` (same severity across shock types),
`assumptions`, `implied_shock_incidence`, `severity_note`, `microdata_kind`.
