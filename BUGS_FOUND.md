# Bugs found

Every issue below was found by reading the code, not by a failing test. Each
entry says what was wrong, where, and what happened to it. Anything still open
is marked **open** with the reason.

## Fixed

### 1. Targeting page could render a stale result

- **File** `web/app/targeting/page.tsx`
- **What was wrong** The page debounced requests by 140 ms but never dropped a
  superseded reply. A cold POST can take a minute, so a drag produced a newer
  request while the old one was still in flight; the old reply then overwrote
  `data`. The table could describe an earlier budget while the slider showed a
  later one.
- **Fix** A `reqId` ref, as on the simulator and protection pages. Only the
  newest reply writes `data`, `error` or `loading`.

### 2. "Five-fold" AUC label described a single hold-out split

- **File** `web/app/targeting/page.tsx`, `api/app/datastore.py`
- **What was wrong** The model section said the ROC-AUC was "five-fold, scored
  on rows the model did not train on". The model is fitted on one 70/30
  `train_test_split` (`random_state=42`), not cross-validated.
- **Fix** The label and its note now describe the 30% hold-out it actually is.

### 3. VUP timeliness note picked the wrong bucket

- **File** `web/app/protection/page.tsx`
- **What was wrong** "last payment, 56.2% a week or more late" — 56.2% is the
  1–10 days late bucket in `data/reference/vup.json`. Payments ≥11 days late are
  28.8%.
- **Fix** "last payment; another 56.2% arrived 1–10 days late".

### 4. "Most common response among the poor" was false

- **File** `web/app/protection/page.tsx`
- **What was wrong** The note sat under "bought less food" (24.4% of poor
  households). The most common response among the poor is working longer or
  more hours (31.4%).
- **Fix** Both coping notes now show the actual subgroup share, read from the
  response rather than hard-coded prose.

### 5. "Five programmes" and "seven instruments" in the same page

- **File** `web/app/protection/page.tsx`
- **What was wrong** `data/reference/vup.json` lists five components. One
  note said seven.
- **Fix** Both say five.

### 6. Double "are" in a heading

- **File** `web/app/protection/page.tsx`
- **What was wrong** "How many people it helps and how poor they are are
  published national figures" — unreadable.
- **Fix** Rewritten.

### 7. Dead `ALLOW_ORIGINS` constant

- **File** `api/app/main.py`
- **What was wrong** `cors_config()` replaced the module constant but left
  `ALLOW_ORIGINS` defined and unused.
- **Fix** Removed.

### 8. Bootstrap ignored the `seed` argument

- **File** `api/app/analytics.py`
- **What was wrong** `_bootstrap_interval` accepted `seed` and hard-coded
  `default_rng(42)`. Passing a seed moved the headline figures but not the
  intervals, which read as a bug.
- **Fix** The parameter was removed and the fixed stream documented: the same
  resamples are used for every rule, so intervals are paired. Making the
  intervals seed-dependent would also break the documented invariant that the
  PMT figures do not move with the targeting seed.

### 9. "People pushed into poverty" used the district mean household size

- **File** `api/app/analytics.py`
- **What was wrong** `newly_poor_people` multiplied the household count by the
  mean size of every household in the district, not of the households that fell.
- **Fix** Weighted by `hh_size` of the affected households. Nyamagabe/drought at
  severity 50 moves 5,652 → 5,797 people.

### 10. Per-IP rate-limit map grew without bound

- **File** `api/app/main.py`
- **What was wrong** `_HITS` kept one deque per client IP forever; nothing
  removed expired clients.
- **Fix** `_prune_hits` drops expired windows once the map exceeds 4,096 entries.

### 11. The overview never linked the protection page

- **File** `web/app/page.tsx`
- **What was wrong** `/protection` was in the header and footer but absent from
  "Continue exploring", the path a first-time visitor follows.
- **Fix** Third card added; the grid is three columns on desktop.

### 12. Mobile nav labels were not short

- **File** `web/components/Nav.tsx`
- **What was wrong** The `short` variant existed so five tabs fit at 390 px, but
  "Who gets help" was identical to the full label.
- **Fix** Short form is "Who"; every link keeps the full label as its accessible
  name. Verified: the strip fits 390 px with zero overflow.

### 13. Stale documentation

- **Files** `AGENTS.md`, `docs/DEPLOY.md`, `docs/METHODOLOGY.md`
- **What was wrong** Four pages described where there are five; the tracked-doc
  list omitted `TRACEABILITY.md`; the simulator aggregate block did not define
  the people count; the bootstrap note did not say the resamples are paired.
- **Fix** Updated. Now seven pages, after `/proof` and `/sources` were added.

### 14. "Five-fold" AUC label described a single hold-out split

- **File** `web/app/targeting/page.tsx`
- **What was wrong** The model panel said the ROC-AUC was "Five-fold, scored on
  rows the model did not train on". `datastore._fit_model` fits one 70/30
  `train_test_split(random_state=42)`; the five-fold numbers belong to
  `scripts/evaluate_model.py`, a separate offline evaluation.
- **Fix** The label now says "Hold-out ROC-AUC … the 30% of households held back
  from training", and reads the count from `/api/meta`.

### 15. The offline snapshot's `/api/meta` was missing newer keys

- **File** `scripts/build_snapshot.py`
- **What was wrong** The live `/api/meta` gained `model_card` and then
  `model_metrics`, but the snapshot payload did not mirror the route. A cold API
  therefore served a fallback meta without the model panel, and the two payloads
  drifted apart with nothing checking.
- **Fix** `payloads()["meta"]` is now built from the same state keys the route
  returns, and `/api/proof` was added to `FILES`. `build_snapshot.py --check`
  still reports drift if the two diverge.

### 16. The simulator computed every component shock twice

- **File** `api/app/analytics.py`
- **What was wrong** `components` called `_simulate_one` twice per shock in one
  list comprehension, once for households and once for cash. With two extra
  shocks that is six full re-simulations where three would do.
- **Fix** One call per shock, read twice.

### 17. The simulator had no range and no shareable URL

- **Files** `api/app/analytics.py`, `web/app/simulator/page.tsx`
- **What was wrong** Targeting reported 95% intervals; the simulator reported a
  single number that looked equally certain, and the scenario lived only in React
  state, so a result could not be sent to anyone.
- **Fix** `_count_band` resamples the district's synthetic households with the
  same fixed stream as the targeting intervals; the two headline cards print the
  band, and the page keeps district, shock, severity and simultaneous shocks in
  the URL with a "Copy result link" button.

### 18. Synthetic households averaged 5.0 people against the published 4.3

- **File** `scripts/build_data.py`
- **What was wrong** `hh_size = rng.poisson(4.0, n) + 1`, under a comment that
  said "around the 4.3 national average". A Poisson draw plus one has mean
  `lambda + 1`, so the layer averaged 5.0 while `data/reference/round.json`
  recorded 4.3. Every figure derived from household counts inherited the gap:
  `newly_poor_people` for Nyamagabe/drought at severity 50 was 5,797 against
  4,785 after the fix.
- **Fix** The draw is `Poisson(average_household_size − 1) + 1` from the
  reference file, and the realised mean is 4.30. `/proof` compares it row by
  row. The regeneration moved the pinned targeting table, so
  `api/tests/`, `README.md`, `docs/SUBMISSION.md`, `docs/METHODOLOGY.md`,
  `docs/MODEL_EVALUATION.md` and `AGENTS.md` were re-pinned in the same commit.

## Open

### 19. Dated audit documents still say "four pages"

- **Files** `docs/TESTING_REPORT.md`, `docs/TECHNICAL_AUDIT.md`
- **Why not changed** Both are dated records ("Run date 31 October 2026 …
  numbers copied from the output"). Rewriting them would misrepresent an audit
  that predates `/protection`. Add a new dated addendum instead if the history
  needs to show the fifth page.

### 20. No `.env` loader in the API

- **File** `api/app/main.py`
- **Why not changed** The API reads `os.environ` directly and every variable has
  a default, so a clone runs with no `.env`. Adding `python-dotenv` would be a
  new dependency for no behavioural gain; `.env.example` documents the
  variables for deployment instead.
