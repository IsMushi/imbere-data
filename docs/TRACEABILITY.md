# Requirements traceability — NISR 2026 rubric

Every criterion mapped to the code that implements it, the test that proves it, and the demo step
that shows it. Nothing here is a claim without a file behind it: if a row cannot name a test or a
route, it is written as a limitation instead.

Scoring is the judges'. This document exists so that a reviewer does not have to take the
submission's word for anything.

---

## Criterion 1 — Problem Understanding & Relevance (20)

| Requirement | Implementation | Evidence |
|---|---|---|
| Frame the problem as a measured gap | 96% financially included (FinScope 2024) against 34% vulnerable and 27.4% below the line (EICV7 2023/24) | `data/reference/national_indicators.json`, `/api/meta`, Overview page |
| Map to NST2 / Vision 2050 | Pillar-by-pillar mapping to the module that answers each | `docs/SUBMISSION.md` §2, `/methodology` → *Where this sits in national policy* |
| Understand the institutional process | Budget-cycle mapping: 1st and 2nd Planning and Budget Call Circulars, Imihigo, MINALOC/LODA joint technical review, LGPAC | `docs/SUBMISSION.md` §2 *Where this sits in the budget cycle* |
| Name the users | NISR, MINALOC, LODA, district planners, development partners | Overview *Built for* band; `README.md` |
| Track's three concerns → three modules | Exclusion → targeting lab; poverty dynamics → map + FGT; social protection impact → simulator + pilot design | `/`, `/simulator`, `/targeting` |

## Criterion 2 — Data Use & Methodology (20)

| Requirement | Implementation | Evidence |
|---|---|---|
| Multiple authoritative datasets | EICV7 Poverty Profile, FinScope 2024, Census 2022, geoBoundaries | `docs/DATA_SOURCES.md`, `/api/meta → sources` |
| Provenance for every input | Publisher, table, licence per source | `docs/DATA_SOURCES.md`; 39 indicators carry source ids |
| Preprocessing that reconciles | District table population-weighted back to the published 27.4% | `/api/meta → national.district_weighted_poverty_rate`; `test_datastore.py` |
| Standard poverty measures | FGT P₀/P₁/P₂, household-size weighted, by district and area | `analytics.poverty_measures`, `/api/poverty`, `test_poverty.py` |
| Rigorous model evaluation | 5-fold out-of-fold, 3 learners, ROC-AUC/PR-AUC/Brier/ECE, confusion matrix, precision/recall/F1, calibration table | `scripts/evaluate_model.py`, `docs/MODEL_EVALUATION.md`, `test_datastore.py::test_model_card_*` |
| Fairness across groups | Coverage of each province's and each residence type's *own* poor at the programme caseload | `evaluate_model.py::fairness_audit`, `docs/MODEL_EVALUATION.md` §Fairness |
| Explainability | Permutation importance on the hold-out set, surfaced as a model card | `datastore._fit_model`, `/api/model`, Methodology page |
| Reproducibility | Seeded build; suite pins every headline figure; snapshot drift check | `python -m pytest tests -q`, `scripts/build_snapshot.py --check` |
| Swap to real microdata | Scripted import with contract validation and design columns | `scripts/import_eicv7.py`, `api/app/contract.py`, `test_contract.py` (11 tests) |
| Round portability | Round identity, seed, sample size and headline rates in one file | `data/reference/round.json`, `test_round.py` (5 tests) |
| Distinguish observed from modelled | Every panel labelled; enforced in API payloads | `microdata_kind`, `SourceNote`, `Tag` |

**Limitation, stated in the same breath:** household rows are calibrated synthetic. The method is
transferable; the figures are not Rwanda's. `docs/METHODOLOGY.md` §7 and §10.

## Criterion 3 — Tech Innovation (20)

| Requirement | Implementation | Evidence |
|---|---|---|
| Optimiser, not a dashboard | Five allocation rules priced on identical budgets and identical households | `analytics.evaluate_targeting`, `/targeting` |
| Cost per outcome | `cost_per_poor_reached` for every rule | `/api/targeting`, `test_analytics.py` |
| Shock simulation with costing | Seven shocks, severity scaling, compound scenarios, per-shock attribution | `analytics.simulate`, `/simulator`, `test_simulate.py` |
| Resilience-aware loss | Savings/mobile money/insurance absorb part of the loss | `analytics.SHOCK_ASSUMPTIONS`, simulator assumption table |
| Uncertainty | Bootstrap intervals on coverage, leakage and cost | `TargetingResult.ci95`, `test_analytics.py` |
| Sensitivity that can fail | Score degradation sweep until the conclusion flips | `evaluate_model.py::degrade`, `docs/MODEL_EVALUATION.md` |
| Round switch | EICV8 is a config edit plus marginal tables | `data/reference/round.json`, `test_round.py` |
| Explicit limits of innovation | No satellite data, no causal identification, no IFMIS integration | `docs/SUBMISSION.md` §10, Methodology *Limitations* |

## Criterion 4 — Usability & Design (19 of 20 sought, 20 not claimed)

| Requirement | Implementation | Evidence |
|---|---|---|
| Four focused pages, one identity | Overview, Simulator, Targeting, Methodology; NISR palette as tokens | `web/app/globals.css` `@theme`, `screenshots/` |
| Map interaction | District choropleth, hover, selection, detail panel | `web/components/RwandaMap.tsx` |
| Immediate feedback with guards | Debounced requests, stale-response guards, dimmed refresh | `simulator/page.tsx`, `targeting/page.tsx` |
| Cold-start honesty | 60 s POST budget, one retry, "waking the engine" notice after 2.5 s | `web/lib/api.ts`, `web/lib/useSlowNotice.ts` |
| Provenance visible | `Measured · published` / `Modelled · illustrative` / `Stated assumption` on every panel | `web/components/Ui.tsx` `Tag`, `SourceNote` |
| Exports | Targeting table to CSV at the on-screen parameters, with the synthetic caveat in the file | `targeting/page.tsx::exportCsv` |
| Responsive | Checked at 390px; tables scroll inside a focusable region | `README.md`, `docs/TESTING_REPORT.md` |
| Accessibility | Semantic tables, `aria-live` status, keyboard-reachable controls, AA contrast | `components/ui/*`, `docs/TESTING_REPORT.md` |

Not claimed: a formal WCAG audit by an external party, and no cross-browser matrix beyond Chrome
and Edge.

## Criterion 5 — Tangible Impact (20)

| Requirement | Implementation | Evidence |
|---|---|---|
| A number a budget office can act on | RWF 191,939 per poor household reached, against RWF 520,833 for universal | `/targeting` headline cards, `README.md` |
| Named pilot, not a hypothetical | Nyanza: 43.3% headcount, −3.6 pts since 2017, 36,827 poor households; envelope, rule, metric and failure conditions | `docs/SUBMISSION.md` §4 *From a number to a pilot* |
| Where it plugs into a real process | Three points in the documented budget cycle, with the three limits | `docs/SUBMISSION.md` §2 |
| Honest about what it cannot claim | No causal impact, no programme evaluation, no eligibility automation | `docs/SUBMISSION.md` §10 |
| Next dataset identified | EICV7 VUP module (catalog 121) for matched recipient comparison | `docs/METHODOLOGY.md` §6 |

Not claimed: any agreement from a district, ministry or development partner. None exists.

---

## What this repository does not do

- It does not assign social-protection eligibility. It ranks and prices; the decision stays with the
  institution.
- It does not estimate causal impact of any programme.
- It does not contain EICV7 microdata. The household layer is calibrated and labelled as such
  everywhere it appears.
- It does not integrate with IFMIS, or with any live government system.
