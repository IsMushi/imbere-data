# Competition presentation

NISR 2026 Big Data Hackathon, Track 2 — Financial Inclusion & Poverty Reduction.
Live: <https://imberedata.vercel.app> · Code: this repository · Pitch: `media/imbere-pitch.mp4`
(2:46, subtitles `media/imbere-pitch.srt`).

## The argument in one paragraph

Rwanda cut poverty from 39.8% to 27.4% between 2017 and 2024, but 27.4% is still 3.6 million
people, and a large share of households sits close enough to the line that one bad season moves
them across it. Social protection has to do two things at once: reach the households that are poor
now, and hold the line for the households one shock away. IMBERE DATA is a working prototype that
prices both decisions. It ranks all 30 districts, predicts household poverty risk without using
consumption, compares five targeting rules under the same budget, and costs what a drought, a
flood or a food-price spike would do to a district — including what it would cost to catch the
households it pushes under the line.

## Demonstration script (5 minutes)

| Time | Where | Say |
|---|---|---|
| 0:00 | `/` | "27.4% national poverty, 34% of adults financially vulnerable, 96% financially included. Inclusion is not resilience — that gap is the problem." |
| 0:40 | `/` map | "All 30 districts. Nyamagabe, Nyaruguru, Rusizi are the highest. Five districts' poverty barely moved since 2017 — those are flagged." |
| 1:20 | `/simulator` | "Pick Nyamagabe. A drought at severity 50 exposes 11,764 households and pushes 1,110 under the line. Cash to restore them: about RWF 3.9 billion." |
| 2:00 | `/simulator` | "Add a flood in the same season." → show the contribution table and the combined row. "Impacts compound, but not additively — a household cannot cross the line twice." |
| 2:40 | `/targeting` | "RWF 300 million, RWF 150,000 per household, 2,000 beneficiaries. Universal reaches 13.9% of the poor. Geographic, 21.9%. Proxy-means, 37.8% with leakage down from 71.2% to 21.9%." |
| 3:30 | `/targeting` | "But geographic reaches only 5 districts; proxy-means reaches 28. That is the fairness trade-off a national programme has to defend." |
| 4:00 | `/targeting` | Click **Download this table (CSV)**. "The export carries its own caveat line, so a file opened in six months cannot be mistaken for a survey extract." |
| 4:20 | `/methodology` | "Every number is labelled published, modelled or assumed. P₀, P₁, P₂ and Gini are computed here; the survey weights are not, because the microdata is not open. That is the honest boundary." |
| 4:45 | close | "Swap in the EICV7 extract and every number changes; the method does not." |

## Against the five criteria

### 1 · Problem understanding and relevance (20)

- Names the users: LODA, MINALOC, district officers — not "policymakers" in the abstract.
- Maps five instruments to the module answering them: NST2 Social Transformation, NST2 social
  protection, NST2 financial sector development, Vision 2050, NISR's statistical mandate.
- The problem is a measured gap (inclusion vs resilience), not an assertion.

### 2 · Data use and methodology (20)

- EICV7 Poverty Profile and tables, FinScope 2024, Census 2022, geoBoundaries; 39 transcribed
  indicators, source registry with URLs and licences.
- FGT P₀/P₁/P₂ with the formula, weights and scope on the page.
- Model: 18 features, consumption deliberately excluded (it is the target, not a predictor),
  5-fold out-of-fold comparison, calibration, confusion matrix, degradation sweep.
- Synthetic household layer calibrated to nine published marginals, labelled everywhere, with a
  one-file swap contract.

### 3 · Technical innovation (20)

- Same-budget, same-sample comparison of five allocation rules with bootstrap intervals **and** a
  geographic-fairness ratio — the part most targeting comparisons leave out.
- Compound shock engine with independent exposure and additive losses, plus per-shock attribution.
- Sensitivity sweep that states how much model quality the conclusion needs, instead of quoting an
  AUC as if it were field performance.
- Snapshot fallback that keeps the interface instant while the API cold-starts.

### 4 · Usability and design (20)

- Four workflows, one page each, with a shared visual language and provenance labels.
- WCAG 2.1 AA: 0 axe violations at desktop and phone widths, 0 horizontal overflow, no text below
  12 px.
- CSV export at the parameters on screen.
- Charts carry units, periods and source notes; no decorative KPIs.

### 5 · Tangible impact (20)

- A district officer can answer "which rule, how much, who gets missed, what does a shock cost"
  before a budget cycle, not after it.
- The cash-need figure is the reserve a shock-responsive budget line has to hold.
- The fairness ratio makes the political cost of geographic targeting visible.

## Questions to expect

**"Is this real data?"**
District poverty, population, national indicators and shock parameters are published figures. The
household rows are synthetic, calibrated to published marginals, and labelled that way in every
response and on every page. The real microdata is not openly redistributable; the swap contract is
documented.

**"Why is your AUC 0.857 when logistic regression scores 0.860?"**
Because the difference is inside noise on 4,520 hold-out rows, and switching would move every pinned
targeting figure for no measurable gain. The comparison is in `docs/MODEL_EVALUATION.md`; the
decision is stated rather than hidden.

**"How do you know proxy-means is better than geographic targeting?"**
At the default budget it reaches 37.8% of the poor against 21.9%, with leakage at 21.9% against
54.7%. The sensitivity sweep shows the advantage survives until the score degrades to roughly AUC
0.60. What it does not show is an impact on consumption — this is a selection comparison, not an
impact evaluation.

**"What would you do with real EICV7 microdata?"**
Drop the synthetic file in, keep the engine, re-run the three build/evaluate/test commands, and
replace the resampling intervals with design-based ones using the survey weights, strata and PSUs.
The model, the rules and the simulator do not change.

**"What is missing?"**
Design-based inference, an impact evaluation, SHAP-level individual explanations, and a CI
pipeline. All four are listed in `docs/IMPLEMENTATION_ROADMAP.md` with what would unblock them.

## Assets

| Asset | Location |
|---|---|
| Pitch video (2:46, 1920×1080) | `media/imbere-pitch.mp4`, subtitles `media/imbere-pitch.srt` |
| Screen-recorded demo (4:41) | linked from `README.md` §Videos |
| Method and data reference | `/methodology` |
| Model evaluation | `docs/MODEL_EVALUATION.md` |
| Audit, roadmap, testing | `docs/TECHNICAL_AUDIT.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/TESTING_REPORT.md` |
