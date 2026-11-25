# Changes summary

Work done against `docs/IMBERE_DATA_OPENCODE_PLAN.md`. The plan was written for an earlier
version of the repo, so the sections below say what was already in place and what this pass
actually changed.

## What changed

### Task 1 — Repo audit and security

- No secrets in the working tree. `.gitignore` already excluded `.env`, `node_modules`,
  build output, virtual environments and model caches; it now also ignores nothing new, and
  `.env.example` documents every `IMBERE_*` and `NEXT_PUBLIC_*` variable with safe defaults.
- No microdata is committed. `data/raw/*.pdf`, `*.xlsx`, `*.dta`, `*.sav`, `*.zip` are ignored;
  the household layer is the calibrated synthetic `data/processed/households.csv`.
- Added `LICENSE` (all rights reserved, with third-party licences listed) and `SECURITY.md`.
- Added `BUGS_FOUND.md`; every issue found while reading the code is recorded there, including
  the two that are deliberately **not** fixed.

### Task 2 — Design system

The token block in `web/app/globals.css` and the `web/components/ui/*` primitive layer were
already in place. The palette has since moved to the plan's calm teal system — `primary #0f766e`,
deep `#115e59`, soft `#ccfbf1`, a warm `#b45309` accent for modelled figures, and outcome-only
green/red — with the chart, map and icon hexes moved in the same pass. Manrope is kept for UI and
Comfortaa for the wordmark.

### Task 3 — Home page

Already implemented. Added a fourth card to "Continue exploring" for `/proof`.

### Task 4 — Data trust

- **New `GET /api/proof`** (`datastore.proof()`), computed from the committed data: 13 published
  indicators beside the same statistic in the synthetic layer, the five province poverty rates,
  household size, the seed and sample size, and the source list. Rows are marked *target* (the
  generator was fitted to it) or *emergent* (it falls out of the calibration and can disagree).
- **New `/proof` page** renders that payload with the measured-vs-modelled language the site
  already uses, explains how the rows were made, lists what the layer can and cannot show, and
  gives a card to every row a point or more away from its published figure.
- `/api/proof` is in `scripts/build_snapshot.py`, so the page paints from `web/public/api/proof.json`
  while a cold API wakes.

### Task 5 — Model proof

- **New `GET /api/model/metrics`** (also merged into `/api/meta`): accuracy, precision, recall,
  F1 and ROC-AUC on the 30% hold-out for the shipped model, a logistic regression on the same
  features, and a **district-averages-only** simple rule.
- The targeting page gained a "Does the model earn its keep?" table and an honest sentence: the
  district rule scores 0.664 against 0.853, but the logistic baseline scores 0.857, so the gain
  comes from household data, not the algorithm. `/methodology` states the same.
- The targeting panel no longer claims a five-fold AUC it does not compute.
- Permutation importance, the model card and the limits box were already on `/methodology`.

### Task 6 — Loading, errors, cold start, mobile

Already implemented (skeletons, `PanelState`, snapshot fallback, warm-up thread, 2.5 s live
timeout). Verified at 390 px on the two new pages: no page overflow, tables scroll inside their
own container.

### Task 7 — Simulator and targeting polish

- **Ranges:** `_count_band` resamples the district's synthetic households 200 times from the same
  fixed stream as the targeting intervals. The two headline cards print the 95% band, and the
  page label says it is sampling variation in the synthetic layer, not uncertainty in the shock
  parameters.
- **Shareable result:** district, shock, severity and simultaneous shocks are kept in the URL;
  every parameter is validated on load, and a "Copy result link" button copies it (with a visible
  failure message if the browser blocks the clipboard).
- Targeting already had ranges, the same budget for all rules and the "what this means" text.

### Task 8 — Methodology and sources

- **New `/sources` page**: the four published sources with publisher, year, licence, link and what
  each is used for; the settings that are assumptions rather than sources; the repository files
  and whether they are transcribed, curated or generated; links to the four documentation files.
- `/methodology` keeps the long-form version. `/proof` and `/sources` are linked from the nav,
  the footer, the overview and each other.

### Task 9 — GitHub hygiene

`README.md` (purpose, screenshots, live link, quickstart, architecture, sources, limits, team,
licence) already existed. This pass updated the architecture block and the page count, added the
proof screenshot, and added `LICENSE`, `SECURITY.md`, `.env.example`.

### Task 10 — Final QA

- `cd api; python -m pytest tests -q` → **100 passed**.
- `cd api; python smoke_test.py` → documented targeting rows unchanged
  (`pmt 78.3 / 37.9 / 21.7 / 191571`, `geographic 46.1 / 22.3`, `universal 27.6 / 13.3`).
- `python scripts/build_snapshot.py --check` → snapshot matches the committed data.
- `cd web; npm run build` → TypeScript clean, 7 static pages.
- Live browser run on `/proof`, `/sources`, `/targeting`, `/simulator`: 0 console or page errors,
  the share URL restores the scenario, 390 px nav fits six tabs with no overflow.

## Bugs found and fixed

Short list; details in `BUGS_FOUND.md`.

1. Targeting page could render a stale response after a fast slider drag.
2. "Five-fold" AUC label on a single hold-out split.
3. VUP note quoted the wrong lateness bucket (56.2% is 1–10 days, not "a week or more").
4. "Most common response among the poor" was false for the row it sat under.
5. "Five programmes" and "seven instruments" on the same page.
6. Double "are" in a heading.
7. Dead `ALLOW_ORIGINS` constant next to `cors_config()`.
8. Bootstrap `seed` argument was accepted and ignored.
9. "People pushed into poverty" used the district mean household size, not the affected households'.
10. Per-IP rate-limit map grew without bound.
11. Overview never linked `/protection`.
12. Mobile nav short label was not short; the strip overflowed at 390 px.
13. The snapshot's `/api/meta` drifted from the live route (missing `model_card`, `model_metrics`).
14. The simulator computed every component shock twice.
15. The simulator had no range and no shareable URL.
16. Stale page counts in `README.md`, `docs/DEPLOY.md`, `AGENTS.md`.
17. Synthetic households averaged 5.0 people against the published 4.3. The draw is now
    `Poisson(4.3 − 1) + 1`; the layer was regenerated and every pinned figure re-recorded.

## New files

- `LICENSE`, `SECURITY.md`, `.env.example`, `BUGS_FOUND.md`, `CHANGES_SUMMARY.md`
- `web/app/proof/page.tsx`, `web/app/sources/page.tsx`
- `web/public/api/proof.json`, `screenshots/proof.png`, `screenshots/sources.png`

## Removed or merged

- `ALLOW_ORIGINS` constant in `api/app/main.py` (dead after `cors_config()` landed).
- The unused `seed` parameter on `analytics._bootstrap_interval`.
- No files were merged or deleted.

## How to run

```powershell
.\run.ps1                 # API on :8000 + UI on :3000, waits for both

# or separately
cd api; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
cd web; npm run dev
```

Regenerate data and snapshot after changing `data/raw` or `data/reference`:

```powershell
python scripts/build_data.py
python scripts/build_snapshot.py
```

## Still open / risks

- **The boosted model does not beat a logistic regression** on the hold-out (0.853 vs 0.857).
  Reported rather than hidden; switching would move every documented targeting figure.
- **The synthetic layer is calibrated, not observed.** A near-zero gap on a *target* row proves the
  calibration ran, not that the joint distribution is right. `/proof` says so above the table.
- **Dated audits** (`docs/TESTING_REPORT.md`, `docs/TECHNICAL_AUDIT.md`) still say "four pages".
  They are run records, left as history.
- **No new sensitivity slider** was added to the simulator: the severity control already is the
  key assumption, and the assumption table on `/methodology` lists the rest.
- **Model metrics are computed at fit time, not written to a JSON file.** They live in the fitted
  state (and therefore in the frozen model payload) and are served by `/api/model/metrics`, which
  is the same contract with one fewer artefact to keep in sync.
- **No `Estimate` badge** was introduced. The site's badge vocabulary is Measured / Modelled /
  Assumed; the bands are labelled "95% band" in text instead of adding a fourth badge tone.
