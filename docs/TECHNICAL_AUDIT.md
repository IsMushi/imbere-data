# Technical audit

Scope: the repository as it stands, not the deployed site alone. Audit date 31 October 2026.
Every row states what was wrong, why it matters, what was done, and how it was checked. Rows that
are still open say so and say what would close them.

## System in brief

| Layer | Implementation | State |
|---|---|---|
| UI | Next.js 16 App Router, 4 statically prerendered pages (`/`, `/simulator`, `/targeting`, `/methodology`), client-side fetch, Tailwind 4 with NISR-derived tokens | Working, WCAG 2.1 AA verified |
| API | FastAPI 0.2.0, 8 routes, no database, in-process rate limit and cache headers | Working, 53 tests |
| Data | `data/raw` transcribed CSVs + 2 published NISR documents; `data/processed` generated and committed; `data/reference` curated indicator tables | Working |
| Model | HistGradientBoostingClassifier over 18 features, consumption excluded, fitted lazily at first request | Working, single evaluation protocol replaced |
| Hosting | Vercel (static UI) + a separate container host for the API (`docs/DEPLOY.md`) | Working, API cold start ~27 s |

There is no authentication because there is no user state: every endpoint is read-only or a pure
function of the request body. That is a deliberate architectural choice for a public prototype,
not an omission to be fixed by bolting on a login.

## Findings

### F1 · Model evaluation rested on one 70/30 split

- **Problem** the only accuracy figure was a single hold-out AUC from one seed. No PR-AUC, no
  calibration, no model comparison, no statement of what happens if the score is less sharp than
  the synthetic data makes it look.
- **Why it matters** a selection model is used to decide who receives money. A point estimate
  without an uncertainty or sensitivity statement is not decision-grade.
- **Module** `api/app/datastore.py`, docs, UI model card.
- **Fix** `scripts/evaluate_model.py`: 5-fold stratified out-of-fold predictions for logistic
  regression, random forest and gradient boosting; ROC-AUC, PR-AUC, Brier, ECE, decile calibration,
  confusion matrix at the programme caseload; then a degradation sweep that blends the production
  score with noise down to AUC 0.60 and re-runs the same allocation.
- **Status** implemented. Report: `docs/MODEL_EVALUATION.md`, machine-readable
  `data/processed/model_evaluation.json`.
- **Verified by** the script re-runs deterministically at seed 42; the app's pinned figures are
  unchanged and still asserted in `api/tests/test_analytics.py`.

### F2 · The production model is not the cross-validation winner

- **Problem** logistic regression scores 0.860 out-of-fold against 0.857 for the shipped
  gradient-boosted model. The difference is inside noise (4,520 hold-out rows), but the app did
  not say so.
- **Why it matters** silently shipping the second-best model is the kind of thing a judge or a
  reviewer will find, and it undermines every other claim on the page.
- **Module** model card, `/methodology`.
- **Fix** the comparison is reported and the decision explained: switching would move every
  pinned targeting figure for no measurable gain, so it was not done. The evaluation report names
  both numbers.
- **Status** documented, decision recorded.

### F3 · No poverty depth or severity, only a headcount

- **Problem** the platform reported district headcount poverty and nothing about how far below the
  line households sit, or how unequal consumption is.
- **Why it matters** headcount can improve while the poorest get poorer. A transfer budget needs
  the gap, not just the count.
- **Module** `api/app/analytics.py`, `/api/poverty`, `/methodology`.
- **Fix** Foster–Greer–Thorbecke P(0), P(1), P(2) nationally, by urban/rural and by district, with
  a weighted Gini; documented formula, weights and a caveat that these are descriptive statistics
  of the calibrated layer, not design-based survey estimates.
- **Status** implemented and surfaced with formulas.
- **Verified by** `api/tests/test_poverty.py` (ordering P0 ≥ P1 ≥ P2, calibration to published
  marginals, 30-district coverage, Gini identity) and the methodology page.

### F4 · Targeting comparison ignored geography and administrative reach

- **Problem** five rules were compared on accuracy, coverage, leakage and cost, but a rule can hit
  those numbers by concentrating every beneficiary in five districts. Nothing showed that.
- **Why it matters** geographic targeting looks efficient precisely because it concentrates; a
  national programme has to defend that concentration politically and administratively.
- **Module** `evaluate_targeting`, `/api/targeting`, targeting page.
- **Fix** a `fairness` block per rule: districts reached, share of beneficiaries in the ten poorest
  districts, and a ratio against those districts' share of all poor households. Rendered as a table
  and included in the CSV export.
- **Status** implemented.
- **Verified by** `test_fairness_reports_how_concentrated_each_rule_is` (geographic: 5 districts,
  ratio 2.09; proxy-means: 28 districts, ratio 1.32; universal: 30 districts, ratio 0.68).

### F5 · The simulator could only apply one shock

- **Problem** real seasons compound: drought plus a food-price spike plus a health shock. The
  engine and the UI handled one at a time.
- **Why it matters** single-shock costing understates the reserve a shock-responsive budget needs.
- **Module** `analytics.simulate`, `POST /api/simulate`, simulator page.
- **Fix** `additional_shocks` (up to six) with independent exposure combination
  `1 − ∏(1 − pⱼ)`, additive losses before resilience absorption, a per-shock attribution table,
  and a combined row that is explicitly lower than the sum because no household crosses the line
  twice. A single shock reduces exactly to the previous formula, so pinned figures did not move.
- **Status** implemented in engine, API and UI.
- **Verified by** `test_compound_shocks_hit_at_least_as_hard_as_either_alone`,
  `test_compound_components_attribute_each_shock`, the API 422 cap test, and a Playwright run of
  add/remove in the browser.

### F6 · The UI blocked on a cold API

- **Problem** the deployed API sleeps on a free tier; the measured cold start was 26.8 s. Every
  page showed skeletons for the whole wake.
- **Why it matters** a judge's first impression is formed in the first few seconds.
- **Module** `web/lib/api.ts` and all four pages.
- **Fix** `scripts/build_snapshot.py` writes the exact API payloads to `web/public/api/*.json`;
  `apiGet` waits 2.5 s then falls back to the snapshot. The snapshot is generated from the same
  committed data by the same engine, so a fallback render is the same figures by a faster route,
  not stale data. `--check` mode fails if the snapshot drifts.
- **Status** implemented.
- **Verified by** `build_snapshot.py --check` and a Playwright run with the API route aborted.

### F7 · No export path from the targeting lab

- **Problem** the analysis ended at the screen. A district officer could not take it into a
  budget file.
- **Why it matters** "reports and exports" is an explicit requirement, and a table you cannot
  file is a demo, not a tool.
- **Module** targeting page.
- **Fix** CSV export of the on-screen table at the on-screen parameters, including the fairness
  columns, with the synthetic-data caveat as the first line of the file.
- **Status** implemented.
- **Verified by** a Playwright download assertion (filename, caveat line, header, five rule rows).

### F8 · API hardening was demo-grade

- **Problem** `allow_origins=["*"]` hard-coded, no rate limit, no cache headers, no request
  timing, no cap on list inputs.
- **Why it matters** a public compute endpoint with no ceiling is an invitation to a bad demo.
- **Module** `api/app/main.py`.
- **Fix** origins from `IMBERE_ALLOW_ORIGINS`, in-process 90 req/min limit on POST with
  `429` + `Retry-After`, `Cache-Control` and `Server-Timing` on GETs, `max_length=6` on additional
  shocks, Pydantic bounds on every numeric field.
- **Status** implemented.
- **Verified by** CORS preflight, 429, cache-header and 422 tests in `api/tests/test_api.py`.

### F9 · Synthetic rows could be mistaken for survey data

- **Problem** the household file is generated. It was labelled in the UI, but the labels were
  prose, not a contract, and the CSV export did not exist yet.
- **Why it matters** this is the single fastest way to lose credibility with NISR.
- **Module** all response payloads, UI, docs.
- **Fix** `microdata_kind` travels with every response that touches household rows; the UI renders
  it as `Modelled · illustrative`; `/methodology` carries a three-register provenance band
  (published / modelled / assumed); the export stamps the caveat; `meta.json` states the swap
  contract.
- **Status** implemented and continuous.

### F10 · No data validation or drift gate

- **Problem** `build_data.py` wrote outputs with no schema checks, and nothing detected a stale
  browser snapshot.
- **Why it matters** regenerating the layer could silently break an invariant (district list,
  weights summing to one, household counts) and the UI would keep rendering.
- **Module** `scripts/build_data.py`, `scripts/build_snapshot.py`.
- **Fix** build-time assertions (row counts, district coverage, bounds, share sums) and
  `build_snapshot.py --check` for commit-time drift.
- **Status** implemented.

### F11 · Residual gaps

| Gap | Impact | Why it is open |
|---|---|---|
| Real EICV7 microdata (catalog 119/121) not accessible | All household-level results are calibrated synthetic; no design-based standard errors | Requires NISR data-access approval and credentials. Documented in `docs/DATA_SOURCES.md` and `docs/METHODOLOGY.md` §6. |
| No survey weights, strata or PSUs | Intervals are resampling intervals only | Only exists with the microdata file above. |
| No SHAP values | Feature attribution is permutation importance, which is global only | Deliberate: adds a heavy dependency for a marginal explanatory gain at this stage. Individual explanations are not claimed. |
| No CI pipeline | Tests run locally before each commit | No CI configuration in the repo; adding one is a deployment decision, not a code gap. |
| No authentication | Anyone can call the compute endpoints | Read-only public data; a login would add friction without protecting anything. Rate limit covers abuse. |
| No persistent logging/monitoring | Errors are visible in host logs only | Requires a hosting choice and an account; out of scope for the prototype. |

## What was checked, not assumed

- `cd api; python -m pytest tests -q` → 53 passed.
- `cd web; npm run build` → TypeScript clean, 4 static routes.
- `python scripts/build_snapshot.py --check` → snapshot matches committed data.
- Playwright: compound shock add/remove, CSV download contents, FGT block, 390 px overflow.
- axe-core WCAG 2.1 A/AA on all four pages at 1440 px and 390 px → 0 violations (see
  `docs/TESTING_REPORT.md` for the run and its limits).
