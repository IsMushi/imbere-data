# Research gap analysis

## The policy problem

Rwanda's poverty rate fell from 39.8% in 2017 to 27.4% in 2024, but the fall was uneven: some
districts barely moved, and a large share of households sits close enough to the line that one bad
season can push them back under it. Social protection therefore has two jobs at once — reach the
households that are poor now, and hold the line for households that are one shock away. Both jobs
are targeting problems, and targeting is where a budget either reaches the poor or leaks.

The platform addresses one question in that space: **given a fixed budget, which allocation rule
reaches the most poor households, what does it cost, how fairly does it spread the caseload, and
what happens to the answer when a shock arrives?**

## What the evidence base already provides

- **Poverty measurement.** The Foster–Greer–Thorbecke class (Foster, Greer & Thorbecke, 1984) is the
  standard decomposable family for incidence, depth and severity, and is what NISR reports. Nothing
  in this project improves on it; the contribution is putting P₀, P₁ and P₂ in front of a
  decision-maker next to the targeting decision they inform.
- **Proxy means testing.** Grosh & Baker (1995) set out the method: score observable household
  characteristics, rank, select the bottom. It is the workhorse of social registries because it
  needs no consumption survey at enrolment. Its weakness is equally well documented — the score is
  only as good as the survey it was trained on.
- **Community versus proxy targeting.** Alatas, Banerjee, Hanna, Olken & Tobias (2012) show, in an
  Indonesian field experiment, that community ranking and proxy means testing trade accuracy
  against legitimacy and cost rather than one dominating. That trade-off is why this platform
  prices both instead of declaring a winner.
- **Shocks and poverty dynamics.** Dercon (2004) shows that idiosyncratic and covariate shocks have
  persistent effects on consumption, which is the empirical case for costing a shock response rather
  than treating poverty as a static stock.
- **Rwanda-specific measurement.** The EICV7 Poverty Profile Report (NISR, 2025) and the associated
  tables supply the district headcounts, poverty lines, shock incidence and coping responses used
  here; FinScope 2024 (Access to Finance Rwanda / NISR) supplies the financial inclusion and
  financial health measures.

## The gap this project targets

**G1 · Household microdata is not openly available, so prototypes either invent rows or stop at
district aggregates.** EICV7 row-level data is released for analysis through the NISR catalog, not
redistributed. A hackathon team without approved access cannot fit or validate a household model on
real rows. The usual responses are to skip the household layer entirely (losing the targeting
question) or to generate rows and present them as survey data (losing credibility). This project
takes a third route: a synthetic layer calibrated to nine published marginals, labelled at every
surface, with a documented one-file swap contract for the real extract.

**G2 · Targeting comparisons are often not comparable.** Published comparisons frequently quote
accuracy for one method and leakage for another, at different budgets or on different populations.
The gap is methodological, not empirical: five rules, one sample, one budget, one caseload, the
same seed policy, and intervals around each metric. This platform enforces that.

**G3 · Efficiency metrics hide geographic concentration.** Geographic targeting looks strong on cost
per poor household precisely because it concentrates spending in a few districts. A national
programme also has to answer whether that concentration is acceptable. The fairness block — districts
reached, share to the ten poorest districts, ratio to proportional — makes the trade-off explicit
rather than leaving it in a footnote.

**G4 · Shock tools report a point estimate without a stated parameter set.** A drought costing is
only as defensible as its exposure and loss assumptions. This project publishes the assumption
table, scales it by a single severity parameter, shows each shock's contribution, and states that
the parameters are assumptions rather than EICV7 estimates.

**G5 · Synthetic-data model evaluation is usually reported as if it were field performance.** The
honest question is not "what is the AUC" but "how much of the conclusion depends on that AUC". The
degradation sweep answers the second question: proxy-means still beats geographic targeting until
the score falls to roughly AUC 0.60, at which point the advantage disappears. That is a sensitivity
statement a reader can argue with.

## What this project does not establish

- **No causal impact.** Targeting accuracy is selection performance. It says nothing about what a
  transfer does to a household's consumption, labour supply or resilience. An impact evaluation
  needs a design (randomisation, regression discontinuity, difference-in-differences), not a
  ranking exercise.
- **No representative estimates.** The household layer is synthetic. Marginals match published
  figures by construction; the joint distribution does not exist in any NISR file. Every
  household-level number inherits that.
- **No design-based inference.** There are no survey weights, strata or primary sampling units in
  the synthetic layer, so the intervals reported are resampling intervals, not standard errors
  under the EICV7 design.
- **No claim that the model predicts real household poverty.** The AUC is measured on synthetic
  rows. It is evidence that the pipeline works and that observable assets carry signal under the
  calibration; it is not evidence about Rwanda.
- **No claim about which district should receive money.** The platform ranks and prices; the
  allocation decision is political and administrative, and the tool is built to inform it rather
  than replace it.

## Why this is a contribution rather than a dashboard

The reusable part is the pipeline, not the pages: a calibrated synthetic layer with an explicit
provenance contract, a same-budget targeting comparison with intervals and a fairness dimension, an
FGT layer, a compound-shock engine with stated parameters, and an evaluation that bounds its own
optimism. Swap in the EICV7 extract and every number changes; the method does not.
