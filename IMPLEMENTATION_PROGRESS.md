# Implementation progress

Audit-first record of what has actually been built, verified and blocked. A phase is only marked
complete when its claims are backed by a test that ran or a command whose output is quoted here.

Last updated: 3 November 2026.

---

## Phase 1 — Codebase audit

**Inspected:** `api/app/{main,datastore,analytics,contract}.py`, `api/tests/*`, `scripts/*`,
`web/app/{page,simulator,targeting,methodology}`, `web/lib/{api,format,useSlowNotice}.ts`,
`web/components/*`, `data/{raw,reference,processed}`, `.gitignore`, `render.yaml`, `run.ps1`.

**Findings, in order of how much they mattered:**

| Finding | Status |
|---|---|
| `docs/` and `scripts/` were gitignored, so the public repo shipped no methodology and no build script while the submission cited both | Fixed — allowlist exceptions in `.gitignore` |
| `apiPost` had no timeout, no retry and no snapshot fallback, on the two pages that carry the innovation claim, against an API that sleeps for 30–60 s | Fixed — 60 s budget, one transport retry, wake notice |
| Household-file swap was an instruction, not a code path | Fixed — `scripts/import_eicv7.py` + `api/app/contract.py` |
| No fairness analysis across province or residence | Fixed — `evaluate_model.py::fairness_audit` |
| Round identity scattered through `build_data.py` | Fixed — `data/reference/round.json` |
| Poverty lines written down twice | Fixed — `national_indicators.json` is the only source; a test enforces it |

**Already present and not rebuilt:** in-process rate limiting, CORS by environment, GET caching,
`Server-Timing`, Pydantic field bounds, permutation importance, calibration table, degradation
sweep, 53-test suite.

## Phase 2 — Data foundation

- Provenance per input: `docs/DATA_SOURCES.md` (publisher, table, licence, 39 indicators).
- Contract enforced in code: `api/app/contract.py`, 11 tests in `api/tests/test_contract.py`,
  covering missing columns, unknown districts, out-of-range binaries, household-size bounds,
  non-positive consumption and wrong currency scale.
- Import path exercised end to end against four inputs: a correct extract imported; a bad district
  refused; a monthly-scale consumption column refused; a missing mapping refused. Output quoted in
  the session log.
- Round portability: `data/reference/round.json`, 5 tests in `api/tests/test_round.py`.

**Blocked:** real EICV7 microdata (NISR catalog 119/121) requires the team's portal account. The
import path is complete and tested; the file is the missing input.

## Phase 3 — Analytical engine

- FGT headcount, depth and severity by district and area (`analytics.poverty_measures`).
- Five targeting rules priced on identical budgets, with bootstrap intervals and a fairness block.
- Seven-shock simulator with severity scaling, compound scenarios and per-shock attribution.
- Model evaluation: 5-fold out-of-fold, three learners, ROC-AUC / PR-AUC / Brier / ECE /
  confusion matrix / precision / recall / F1 / calibration table / permutation importance.
- **New:** fairness audit at the programme caseload. Result is reported, not smoothed —
  coverage of each province's own poor runs 6.4% (Kigali City) to 46.6% (South), 7.3×, and urban
  poor at 21.5% against 38.2% rural.

**Not attempted:** SHAP (permutation importance is in place and is the documented explanation
method); design-based standard errors (no weights in the synthetic layer — the absence is asserted
by a test rather than assumed).

## Phase 4 — Geospatial and policy intelligence

- 30-district choropleth on geoBoundaries geometry, rewound by `scripts/fix_geojson.py`.
- District detail: poverty, rank, mobile money, savings, shock incidence, resilience, financial
  health.
- Policy framing: budget-cycle mapping in `docs/SUBMISSION.md` §2; pilot design in §4.

**Not attempted:** satellite or gridded covariates. They would change the feature set and every
pinned figure, and could not be validated within the competition window.

## Phase 5 — Frontend and UX

- Design tokens from NISR's own palette; one family (Comfortaa); explicit px type scale with a
  floor.
- Provenance labels on every panel; skeletons that mirror the result layout.
- Cold-start handling: wake notice, bounded wait, typed timeout with an actionable message.
- CSV export at the on-screen parameters, carrying the synthetic-data caveat.

## Phase 6 — Security and performance

Present before this pass: rate limiting (90 POST/min/client, `Retry-After`), CORS allow-list from
`IMBERE_ALLOW_ORIGINS`, no credentials or accounts, read-only API, no household-level endpoint,
weak-set friendly defaults. Added: none needed — the audit found no new issue.

Documented limitation: `pip`-level dependency CVEs are not audited in this repo; there is no CI.

## Phase 7 — Testing

| Suite | Result |
|---|---|
| `python -m pytest tests -q` | 69 passed (53 original, 5 round-config, 11 contract) |
| `npm run build` (includes `tsc`) | Compiled, 9/9 static pages |
| `python scripts/build_snapshot.py --check` | exit 0, snapshots match |
| `scripts/import_eicv7.py` against four inputs | 1 accepted, 3 refused with a specific reason |

**Not done:** browser-driven end-to-end tests and a formal accessibility audit. Both are listed as
limitations in `docs/TRACEABILITY.md` rather than claimed.

## Phase 8 — Deployment and submission

- Deployed and reachable: `imberedata.vercel.app` (200), `imbere-data.onrender.com/api/health`
  (200), `/api/targeting` reproducing the pinned table exactly.
- Cold start measured: ~12 s to first `/api/meta`, 4–6 s warm for POSTs.

- **Timeline, stated plainly.** The competition submission closed on 31 October 2026. This work
  was written afterwards and is committed with its real date, under a message that says so. It is
  a refinement of the submitted entry, not part of it, and the commit history should be read that
  way. Backdating the commits was considered and refused: a false author date contradicts the
  Vercel deploy timestamp, the GitHub activity record and the object metadata, and this project's
  entire argument rests on never presenting one thing as another.

**Blocked / outstanding:**

1. EICV7 microdata — team action on the NISR portal.
2. Any institutional commitment for the pilot — team action.

---

## Honest ceiling

The remaining rubric points are evidence, not code: real microdata (C2), a named institutional
commitment (C5), and genuine technical novelty such as satellite covariates (C3). Everything that
could be built without those has been built and tested.
