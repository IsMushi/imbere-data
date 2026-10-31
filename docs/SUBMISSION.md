# Submission — NISR 2026 Big Data Hackathon

**Track 2: Financial Inclusion & Poverty Reduction**
**Project:** IMBERE DATA — Financial Resilience & Targeting Intelligence
**Team:** _[names, universities]_ · **Submitted:** _[date]_

---

## 1. One-paragraph summary

Rwanda has achieved **96% financial inclusion**, yet **34% of adults remain financially vulnerable** and **27.4% of the population lives below the poverty line**. Access has outpaced resilience. IMBERE is a decision tool for the three questions that follow: **where** fragility is concentrated, **what shock** pushes households under the line, and **which targeting rule** reaches the poor most cheaply. It combines published NISR EICV7 and FinScope 2024 evidence with a household-level targeting engine, and is explicit about which numbers are measured and which are modelled.

---

## 2. The problem, and why it matters now

Rwanda's financial-inclusion success is real and well documented. But three published facts sit uncomfortably beside it:

| Fact | Value | Source |
|---|---:|---|
| Adults financially included | 96% | FinScope 2024 |
| Adults financially vulnerable or extremely vulnerable | 34% | FinScope 2024 |
| Population below the poverty line | 27.4% | EICV7 2023/24 |
| Households reporting at least one severe shock | 37.1% | EICV7 Table 6.10 |
| Adults exposed to a climate shock who took a financial mitigation measure | 30% | FinScope 2024 |
| Districts where poverty fell by less than 5 points since 2017 | 5 of 30 | EICV7 Annex B |

A mobile wallet does not stop a drought. The policy question is not *"who has an account?"* but *"who is one shock away from the poverty line, and what is the cheapest way to reach them?"* That is the gap IMBERE addresses.

### Alignment with national priorities

- **NST2 — Social Transformation pillar.** Directly supports poverty reduction, social-protection targeting and the expansion of financial inclusion beyond access to resilience.
- **Vision 2050.** Contributes to the poverty-free, high-income trajectory by making social-protection spending more efficient per franc.
- **NISR's own mandate.** Uses EICV7 and FinScope 2024 as the analytical backbone and produces district-level evidence that NISR, MINALOC and LODA can act on.

---

## 3. What the prototype does

Three linked modules, each answering one decision.

### Module 01 — Where fragility sits
A 30-district choropleth of headcount poverty (2024) with the change since 2017, using the same legend bins as the official EICV7 Poverty Profile map so the two can be read side by side. Clicking a district shows people below the line, share of Rwanda's poor, national rank, mobile-money and savings coverage, severe-shock incidence, a resilience index and the financial-health distribution.

### Module 02 — What a shock costs
Select a district, shock type (drought, flood, storm, pest, health, food price, income loss) and severity. IMBERE applies the shock to the household distribution, lets resilience absorb part of the loss, and reports households exposed, households pushed below the line, the district poverty rate before/after, and the cash required to restore every affected household to the line. A comparison panel ranks all seven shocks at the same severity. Shocks can be compounded — add a second and third shock in the same season and the outcome shows each one's own contribution next to the combined total.

### Module 03 — Which targeting rule works
Five allocation rules run against the same budget and the same household distribution:

| Rule | Selection logic |
|---|---|
| Universal | Random — the benchmark |
| Geographic | Rank districts by poverty rate |
| Community-based | Rank by asset poverty (Ubudehe-style) |
| Financial-exclusion first | Prioritise households with no mobile money and no savings |
| **Proxy-means test** | Model-predicted poverty probability from observable characteristics |

Each is scored on targeting accuracy, coverage of the poor, leakage, exclusion error and **cost per poor person reached**, with a coverage curve showing how each degrades as the caseload grows. A geographic-reach block adds districts reached and a fairness ratio against the poorest decile, because a rule can hit its coverage target by concentrating the caseload in five districts. The table exports to CSV at the parameters on screen, with the synthetic-data caveat written into the file.

---

## 4. Headline result

At **RWF 300m** with **RWF 150,000** per beneficiary (2,000 households, a 13.3% caseload):

| Rule | Accuracy | Poor reached | Leakage | Cost per poor reached |
|---|---:|---:|---:|---:|
| Universal | 28.8% | 13.9% | 71.2% | RWF 520,833 |
| Geographic | 45.3% | 21.9% | 54.7% | RWF 331,126 |
| Community-based | 57.6% | 27.9% | 42.4% | RWF 260,417 |
| Financial-exclusion first | 61.0% | 29.5% | 39.0% | RWF 246,103 |
| **Proxy-means test** | **78.2%** | **37.8%** | **21.9%** | **RWF 191,939** |

**On the calibrated layer, 37.8% of poor households reached against 13.9% for universal selection at the same budget — a 2.7× ratio that characterises the method, not Rwanda, because the joint distribution it runs on is calibrated rather than observed.** Leakage falls from 71.2% to 21.9%. Geographic targeting captures most of the gain at a fraction of the data cost — the practical fallback where a full household survey is unavailable.

> These figures come from calibrated synthetic household rows. The engines do not change when the real EICV7 file is loaded — only the rows they read. See §6.

---

## 5. Rubric mapping

### Criterion 1 — Problem Understanding & Relevance (20)

- The problem is framed as a **measured gap**, not an assertion: 96% inclusion vs 34% vulnerability vs 27.4% poverty, all from published sources.
- The track's three stated concerns — financial exclusion, poverty dynamics, social-protection impact — each map to a module.
- Explicit NST2 and Vision 2050 alignment (§2).
- The five "stalled" districts are identified from the data, giving policymakers a concrete starting point.
- **Evidence:** Overview page; `README.md` §"The problem"; `data/reference/national_indicators.json`.

### Criterion 2 — Data Use & Methodology (20)

- **Two NISR datasets plus two external sources:** EICV7 Poverty Profile (Annex B, Tables 5.1, 6.3–6.11), FinScope 2024 (inclusion, financial health, climate module), Census 2022 (district populations), geoBoundaries/NISR Open Data (district geometry, CC BY 4.0).
- **39 published indicators** transcribed with source IDs; poverty lines at January 2024 prices.
- **Rigorous preprocessing:** district table reconciles to the published 27.4% national headcount when population-weighted — an internal consistency check.
- **Calibrated household layer** reproducing nine published marginals (poverty, extreme poverty, shock incidence, mobile money, savings, insurance, financial-health bands) — and the calibration report is regenerated on every build, so drift is visible rather than silent.
- **FGT poverty measures** (incidence, depth, severity) computed nationally, by urban/rural and by district, with the formula, weights and scope on the method page; a household-size-weighted consumption Gini alongside.
- **Proxy-means model** with consumption deliberately excluded, evaluated five-fold out-of-fold: ROC-AUC 0.857, PR-AUC 0.673, Brier 0.134, ECE 0.006, with logistic (0.860) and random forest (0.852) compared. A degradation sweep shows how far the score can fall before geographic targeting wins.
- **Full method documented** with formulas, assumptions and a one-file contract for swapping in the real EICV7 microdata.
- **Evidence:** `docs/METHODOLOGY.md`; `scripts/build_data.py`; `api/app/datastore.py`; `data/processed/calibration.json`.

### Criterion 3 — Tech Innovation (20)

- **A targeting optimizer, not a dashboard.** The comparison of five allocation rules on identical budgets is the differentiator, and it produces an actionable number (cost per poor person reached).
- **Shock simulator** turns static survey data into a what-if tool with a cash-need costing; shocks compound, with independent exposure, additive losses and a per-shock attribution table.
- **Fairness-aware comparison:** districts reached and a ratio against the poorest decile, so geographic concentration is priced alongside cost per poor household.
- **Resilience-aware loss model:** households with savings, mobile money and insurance retain more consumption under the same shock — connecting the FinScope financial-health concept to the EICV7 poverty measure.
- **Clean architecture:** FastAPI analytical engine, Next.js interface, strict real-vs-modelled separation enforced in code and surfaced in the UI.
- **Reproducible:** seeded build, a pytest suite that pins every headline figure.
- **Evidence:** `api/app/analytics.py`; `web/app/targeting/page.tsx`; `api/tests/`.

### Criterion 4 — Usability & Design of Tool/Prototype (20)

- Four focused pages with a consistent visual language; no dashboard sprawl.
- **Interactive choropleth** with hover, selection and district detail.
- **Immediate feedback:** simulator and targeting lab re-run on input change with debounced requests and stale-response guards.
- **Every modelled panel is labelled** `Modelled · illustrative`; every published panel `Measured · published`. Judges and policymakers can see provenance at a glance.
- **Plain-language interpretation** panels ("Reading this", "The argument") translate numbers into a sentence a minister can use.
- Responsive layout, accessible contrast, keyboard-reachable controls, semantic table markup.
- **Evidence:** Overview, Simulator, Targeting, Method pages; `web/components/Ui.tsx`.

### Criterion 5 — Tangible Impact (20)

- **Directly usable by MINALOC / LODA / NISR** to compare targeting rules before a budget cycle, and by districts to size a shock-responsive reserve.
- **Quantified efficiency gain:** 2.7× more poor people reached per franc on the calibrated layer; leakage cut by 49.3 percentage points. The direction is what proxy-means testing predicts generally; the magnitude is a property of this calibration and is restated against real rows once EICV7 lands.
- **Deployable at low cost:** a district officer needs only a browser; the backend is a single container.
- **Extensible to programme impact:** the EICV7 VUP module (catalog 121) is identified as the next dataset, enabling matched recipient/non-recipient comparison rather than selection performance alone.
- **Honest about the frontier:** the tool states what it cannot yet claim (no causal impact), which is what makes it safe to put in front of a policymaker.
- **Evidence:** §4; `docs/METHODOLOGY.md` §8; Targeting page headline cards.

---

## 6. What is measured and what is modelled

This separation is the core methodological commitment of the project.

| Layer | Status |
|---|---|
| 30-district poverty (2024, 2017), ranks | **Published** — EICV7 Annex B |
| Province and urban/rural poverty | **Published** — EICV7 Table 5.1 |
| Poverty lines (RWF 560,127 / 356,432) | **Published** — EICV7 §3.3 |
| Shock incidence, types, coping responses | **Published** — EICV7 Tables 6.10 / 6.11 |
| Inclusion, financial health, climate exposure | **Published** — FinScope 2024 |
| District populations and household counts | **Published** — Census 2022 |
| Household-level rows | **Calibrated synthetic** |
| Risk-model accuracy | **Measured on synthetic rows** |
| Shock exposure and loss parameters | **Stated assumptions** |

The household layer exists because NISR microdata access is granted manually and was not available during the build window. It is generated by `scripts/build_data.py` from published marginals, and `data/processed/households.csv` is a flat, documented contract: replacing it with the EICV7 file and restarting refits the model and leaves every engine unchanged.

We consider this a strength rather than a shortcut: the calibration is checked against nine published marginals, the calibration report ships with the repo, and the limitation is stated on every page that depends on it.

---

## 7. AI-use disclosure

In line with the competition rules, we disclose the use of AI assistance.

- **Tool:** an AI coding assistant was used for code generation, refactoring, documentation drafting and debugging.
- **What was AI-assisted:** scaffolding of the Next.js and FastAPI applications, chart and map components, boilerplate, and first drafts of `README.md`, `docs/METHODOLOGY.md` and this document.
- **What the team owns:** problem framing, choice of datasets, all data transcription from NISR/FinScope sources, the calibration design, the targeting rules, the shock model, verification of every figure quoted, and the final review of all code and text.
- **Verification:** every published figure was transcribed from the cited NISR/FinScope tables; the district table reconciles to the published national headcount; the build is seeded and reproducible; `python -m pytest api/tests -q` regenerates and pins the headline numbers.
- **Responsibility:** the team takes full responsibility for the accuracy, originality and integrity of the submission.

No AI-generated content was presented as observed data. Synthetic household rows are labelled as such in code, API responses, the interface and this document.

---

## 8. Intellectual property

By submitting, the team agrees to assign and transfer all intellectual property rights in the submitted work to the National Institute of Statistics of Rwanda, as required by the competition rules.

Third-party components retain their own licences:

- NISR and FinScope data — CC BY 4.0 / NISR microdata release policy, attributed in the app and `README.md`.
- District boundaries — geoBoundaries / NISR Open Data, CC BY 4.0.
- Open-source libraries (Next.js, React, FastAPI, scikit-learn, d3-geo) — their respective licences.

---

## 9. Deliverables

| Deliverable | Location |
|---|---|
| Public GitHub repository | [IsMushi/imbere-data](https://github.com/IsMushi/imbere-data) |
| Deployed application | [imberedata.vercel.app](https://imberedata.vercel.app) · API: [imbere-data.onrender.com](https://imbere-data.onrender.com/api/meta) |
| **Video — pitch (2:46, required)** | [`media/imbere-pitch.mp4`](../media/imbere-pitch.mp4) · captions [`media/imbere-pitch.srt`](../media/imbere-pitch.srt) · script in `docs/VIDEO_SCRIPT.md` |
| **Video — screen-recorded demo (4:41, required)** | [Google Drive](https://drive.google.com/file/d/1Ccac1gl9cttLDfYVWb3dwWqZ-audmsKX/view?usp=sharing) |
| Documentation | `README.md`, `docs/METHODOLOGY.md`, this file |
| Reproducible build | `cd api && python -m pytest tests -q` |

Both videos are required, not optional extras, and are linked from `README.md` §Videos and from
the top of the README. The pitch is committed to the repository at `media/imbere-pitch.mp4` so it
survives link rot; the demo is hosted on Drive because it is a 4:41 screen capture.

### Running locally

```bash
# data
python scripts/build_data.py

# API
cd api
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# interface
cd web
npm install
npm run dev          # http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE` to the deployed API URL for a hosted build.

---

## 10. Known limitations

1. **Household rows are synthetic.** Rankings, AUC and cost figures describe the prototype, not Rwanda. The swap contract is documented and is a file replacement, not a refactor.
2. **FinScope 2024 is national.** It does not publish district estimates, so district financial access uses the EICV7 mobile-money and savings modules instead.
3. **District sample sizes are modest** (~500 households), so confidence intervals are wide; only 17 of 30 districts had a statistically significant poverty reduction.
4. **Shock parameters are assumptions**, anchored loosely on the 37.1% severe-shock incidence. The ranking of shocks is more robust than the levels.
5. **No causal claim.** Targeting results are selection performance, not programme impact. The VUP module is the natural next step for impact evaluation.
6. **Cash-need figures are a costing exercise** at the poverty line, not a budget recommendation.
7. **No design-based inference.** The synthetic layer carries no survey weights, strata or PSUs, so reported intervals are resampling intervals, not EICV7 standard errors.
8. **The shipped model is not the cross-validation winner.** Logistic regression scores 0.860 out-of-fold against 0.857 for the gradient-boosted model; the gap is inside noise and switching would move every pinned figure, so the comparison is reported rather than acted on (`docs/MODEL_EVALUATION.md`).
