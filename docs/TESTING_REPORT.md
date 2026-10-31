# Testing and validation report

Run date 31 October 2026, on the tree that produced the current commit. Every command below was
executed; the numbers are copied from the output, not estimated.

## Summary

| Check | Command | Result |
|---|---|---|
| Python test suite | `cd api; python -m pytest tests -q` | **53 passed**, 3 warnings, 27.9 s |
| Production build | `cd web; npm run build` | TypeScript clean, 4 static routes + 3 assets |
| Snapshot drift | `python scripts/build_snapshot.py --check` | `snapshot matches the committed data` |
| Browser workflows | `python scratch/check_new_ui.py` | 6 checks passed, no console errors |
| Accessibility | `python scratch/audit_rubric.py` (axe-core 4.10.2) | **0 violations** on 4 routes × 2 viewports |
| Layout | same script | horizontal overflow 0 px at 1440 px and 390 px |

The two `scratch/` harnesses are local-only (gitignored). The pytest suite is the committed,
repeatable part; the browser checks are documented here so they can be re-run.

## Python suite

| File | Tests | What it pins |
|---|---:|---|
| `api/tests/test_datastore.py` | 8 | Loaded data contract: 30 districts, no missing features, poor/extreme flags consistent with the lines, binary assets, model card AUC, single published state under concurrent cold start |
| `api/tests/test_analytics.py` | 12 | The five documented targeting rows **exactly** (accuracy, coverage, leakage, cost), monotonicity in budget, coverage curve ordering, fairness block, bootstrap intervals |
| `api/tests/test_simulate.py` | 11 | Severity monotonicity, no shock reduces poverty, metadata from the published table, compound shocks ≥ either alone, per-shock attribution, unknown shock rejection |
| `api/tests/test_poverty.py` | 6 | FGT ordering P₀ ≥ P₁ ≥ P₂, headcount within 1 pp of the calibrated marginal, 30-district coverage, Gini identity, declared weights/scope, endpoint parity |
| `api/tests/test_api.py` | 16 | Route behaviour, 404 on unknown district, 400 on unknown rule, 422 on bounds, compound payload, CORS preflight, 429 + `Retry-After`, cache and timing headers, reads not rate-limited |

The three warnings are a Starlette `TestClient` deprecation and a scikit-learn `OptimizeWarning`
(`Unknown solver options: iprint`) raised inside the logistic baseline fit. Neither affects a
result; the warning is a known interaction between scikit-learn 1.5.2 and the installed SciPy on
Python 3.13.

### Why the figures are asserted exactly

`test_documented_headline_figures` requires proxy-means `78.2 / 37.8 / 21.9 / 191,939`,
geographic `45.3 / 21.9`, universal `28.8 / 13.9`. The same table appears in `README.md`,
`docs/METHODOLOGY.md` and `docs/SUBMISSION.md`. An exact assertion turns a silent seed or RNG-order
change into a failing test instead of three documents that quietly disagree with the app.

## Build

```
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages (9/9)
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /apple-icon.png
├ ○ /icon.svg
├ ○ /methodology
├ ○ /simulator
├ ○ /targeting
```

All four pages are prerendered. `npm run build` succeeds with the API down, by design.

## Browser workflows (`scratch/check_new_ui.py`)

| Check | Assertion |
|---|---|
| Compound scenario | After adding a second shock, the outcome shows a per-shock contribution table and a `Combined` row; the single-shock run did not |
| Add / remove | A third shock can be added and removed; the row disappears |
| Fairness table | `Geographic reach`, `Districts reached` and `vs proportional` render on `/targeting` |
| CSV export | Download named `imbere-targeting-300m-150k.csv`, 1,002 bytes, starts with the synthetic-data caveat, contains `fairness_ratio` and all five rules |
| FGT block | `/methodology` renders `How many, how far below, how unequal` and the P₀ cell |
| Mobile | Compound rail at 390 px produces 0 px horizontal overflow |

Console errors across the run: none.

## Accessibility

axe-core 4.10.2, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, run on `/`, `/simulator`,
`/targeting`, `/methodology` at 1440 × 900 and 390 × 844.

- 0 violations on all eight page/viewport combinations.
- 0 elements with text below 12 px.
- 0 px horizontal document overflow.

One issue was found and fixed during this pass: the FGT formula list used `<dt>` followed by bare
text inside a `<div>`, which axe flags as `definition-list` (serious). Each definition is now a
`<dd>`, and the violation is gone.

**What axe does not cover**: automated rules catch roughly a third of accessibility problems. It
does not judge whether a chart is interpretable without colour, whether a screen-reader flow makes
sense, or whether focus order is logical. The charts carry text alternatives and the palette was
verified for contrast, but no assistive-technology user has tested the site.

## What is not tested

| Area | Status |
|---|---|
| Load / soak testing | Not performed. The rate limiter is exercised by unit tests, not under concurrent load. |
| Cross-browser | Chromium only (Playwright). Safari and Firefox are not verified. |
| Real microdata path | The EICV7 loader is documented but has never run on a real extract, because access was not granted. |
| Statistical validity on Rwanda | Not testable with synthetic rows. The synthetic-data caveat is a correctness statement, not a hedge. |
| Offline fonts | Comfortaa loads from Google Fonts; offline the site falls back to system sans and the layout is not re-verified. |
| CI | No pipeline. The three verify commands are run manually before each commit. |

## Reproduction

```powershell
# API
cd api
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest tests -q

# Data + snapshot
cd ..
python scripts/build_data.py
python scripts/build_snapshot.py
python scripts/build_snapshot.py --check
python scripts/evaluate_model.py      # rewrites docs/MODEL_EVALUATION.md

# UI
cd web
npm install --no-bin-links
npm run build
```
