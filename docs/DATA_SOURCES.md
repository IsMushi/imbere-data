# Data sources and access conditions

Every number in the platform descends from one of the sources below, or is computed from them.
The registry is the authority: if a figure cannot be traced to a row here, it should not be on the
site.

## Registry

| # | Dataset | Publisher | Period | Coverage | Variables used | Units | Access | Update cadence |
|---|---|---|---|---|---|---|---|---|
| 1 | EICV7 — Poverty Profile Report 2023/24 | NISR | Fieldwork 2023/24, published 2025 | National, province, 30 districts, urban/rural | Poverty headcount 2024 and 2017, extreme poverty, poverty lines, inequality, population and household counts, shock incidence, coping responses | Percent, RWF per adult equivalent per year, counts | Public PDF + Excel, CC BY 4.0 | New EICV round roughly every three years |
| 2 | EICV7 Tables — Poverty Analysis (Excel) | NISR | 2023/24 | Same | Annex B district table, Tables 5.1, 6.3, 6.6–6.11 | Percent, RWF, counts | Public download, CC BY 4.0 | With each EICV publication |
| 3 | FinScope 2024 — Financial Inclusion in Rwanda | Access to Finance Rwanda / NISR | 2024 | National | Inclusion rate, mobile money, savings, insurance, financial health segments, climate exposure | Percent | Public report; row-level microdata via NISR catalog | Roughly every three years |
| 4 | Rwanda Population and Housing Census 2022 | NISR | 2022 | National, district | District population, household counts | Persons, households | Public, CC BY 4.0 | Decennial |
| 5 | geoBoundaries — Rwanda ADM1 | geoBoundaries (William & Mary) | Current release | 30 district polygons | District boundaries, names | GeoJSON geometry (WGS 84) | Public, CC BY 4.0 | Periodic boundary releases |
| 6 | EICV7 household microdata | NISR | 2023/24 | Household, cluster | Consumption, assets, weights, strata, PSU | Row-level | **Restricted** — application via the NISR microdata catalog (catalog 119/121) | With each round |

Source URLs are carried in `data/processed/meta.json` and rendered on `/methodology`, so the site
and this document cannot drift apart silently.

## What is observed, derived, modelled and synthetic

| Class | Where it lives | Examples | Count |
|---|---|---|---|
| **Observed / published** | `data/raw/*.csv`, `data/reference/national_indicators.json` | District poverty 2024 and 2017, poverty lines, Census population, FinScope inclusion rates | 39 indicators + 30 district rows |
| **Derived** | computed at request time | Population-weighted national headcount, province rates, poverty change in percentage points, FGT measures on the household layer, targeting outcomes | — |
| **Model-generated** | computed at request time | Poverty-risk probability, resilience index, financial-health segment, targeting rankings | — |
| **Synthetic** | `data/processed/households.csv` | 15,066 household rows calibrated to nine published marginals (seed 20261030) | 15,066 rows × 26 columns |
| **Assumed** | `api/app/analytics.py` | Shock exposure and loss parameters, severity scaling, resilience absorption (55%) | 7 shock types |

The synthetic layer is **not** a survey extract. Its marginals match published EICV7 / FinScope
figures; its joint distribution does not exist in any NISR file. Every response that touches it
carries `microdata_kind: calibrated_synthetic`, and the UI labels those panels
`Modelled · illustrative`.

## Access conditions, honestly stated

- **EICV7 reports and tables** are public downloads and are redistributed here only as transcribed
  CSVs, not as copies of the PDFs or XLSX. Those stay local and gitignored.
- **Row-level EICV7 and FinScope microdata** are released for analysis, not redistribution. The
  repository therefore contains no `.dta`, `.sav` or extracted archive, and `.gitignore` blocks
  them explicitly. Access requires an application to NISR; it was not granted during the
  hackathon window, which is why the household layer is synthetic.
- **Census 2022** figures used here are the published district totals, not record-level data.
- **geoBoundaries** geometry is CC BY 4.0 but must be re-wound for d3-geo (see
  `scripts/fix_geojson.py`); the wrong winding renders every district as the whole sphere.

## Sources reviewed but not integrated

These were checked for coverage and rejected for this iteration, so no claim depends on them:

- **World Bank Poverty and Equity Briefs / WDI** — corroborate the direction of the EICV7 series
  but publish at a different vintage and definition; mixing them into a district table would
  create an apples-to-oranges comparison.
- **National Bank of Rwanda financial stability reports** — institution-level, not household-level;
  FinScope already supplies the household inclusion measures.
- **MINAGRI / MINEMA crop and disaster statistics** — useful for calibrating shock exposure, but
  they are not distributed at the household level needed to replace the stated assumptions. This is
  the first external source to add once the assumption table is revisited.
- **Rwanda Climate Services / CHIRPS rainfall** — would support a drought index, but the simulator
  works from stated severity, not an observed rainfall series; wiring it in without a validated
  loss function would add precision without accuracy.

## Update procedure

1. Replace or extend the transcribed CSVs in `data/raw` (keep the same columns).
2. Run `python scripts/build_data.py` — it asserts district coverage, value bounds and that
   household shares sum to one.
3. Run `python scripts/build_snapshot.py` to refresh the browser fallback.
4. Run `python scripts/evaluate_model.py` if the household layer changed; it rewrites
   `docs/MODEL_EVALUATION.md`.
5. Run `cd api; python -m pytest tests -q`. If a pinned figure moved, update `README.md`,
   `docs/METHODOLOGY.md` and `docs/SUBMISSION.md` in the same commit.
6. Run `cd web; npm run build`.
