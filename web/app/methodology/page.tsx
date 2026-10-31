"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BarList } from "@/components/BarList";
import { FadeIn } from "@/components/Motion";
import { SectionNav } from "@/components/SectionNav";
import {
  PanelState,
  PullQuote,
  SectionHeading,
  SkeletonBars,
  SourceNote,
  Tag,
} from "@/components/Ui";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, type Meta, type PovertyResponse } from "@/lib/api";
import { num, pct } from "@/lib/format";

/** Module scope on purpose: `SectionNav` keys its scroll listener on this array. */
const SECTIONS = [
  { href: "#measured", label: "Measured vs modelled" },
  { href: "#poverty", label: "Poverty measures" },
  { href: "#model", label: "Proxy-means model" },
  { href: "#rules", label: "Allocation rules" },
  { href: "#shocks", label: "Shock assumptions" },
  { href: "#alignment", label: "National alignment" },
  { href: "#sources", label: "Sources" },
  { href: "#limits", label: "Known limitations" },
];

/**
 * Shown when `/api/meta` cannot be reached. The provenance section has to draw the line
 * even with the API down, so the sentence naming the swap contract is duplicated here
 * rather than rendered as a blank paragraph. Mirrors `microdata.note` in
 * data/processed/meta.json — change both together.
 */
const MICRODATA_FALLBACK =
  "Household-level rows are synthetic. Marginals are calibrated to published EICV7 figures (Tables 6.3, 6.6-6.11); the joint distribution is not observed data. Replace with the EICV7 microdata file via the loader in api/app/datastore.py.";

/**
 * National-priority mapping. A claim of alignment is unfalsifiable; a table that pins each
 * instrument to the module serving it is not. Kept in the reference page rather than the
 * dashboard so the overview stays a story about households.
 */
const ALIGNMENT = [
  {
    instrument: "NST2 · Social Transformation",
    asks: "Reduce poverty and widen social-protection coverage.",
    answers:
      "Ranks all 30 districts on headcount poverty and flags the five where progress stalled, so transfers are aimed before the budget cycle rather than after it.",
  },
  {
    instrument: "NST2 · Social protection (VUP)",
    asks: "Target the poorest households without leaking to the non-poor.",
    answers:
      "Prices five allocation rules at the same budget and reports leakage, exclusion error and cost per poor household reached for each.",
  },
  {
    instrument: "NST2 · Financial sector development",
    asks: "Move from access to usage and resilience.",
    answers:
      "Separates 96% inclusion from 34% vulnerability and 10% financial health, then models what a shock does to each group.",
  },
  {
    instrument: "Vision 2050",
    asks: "A poverty-free, high-income Rwanda.",
    answers:
      "Costs the shocks that push households back under the line and the cash needed to catch them, district by district.",
  },
  {
    instrument: "NISR statistical mandate",
    asks: "Evidence that districts can act on.",
    answers:
      "Every figure carries its source and its status — published, modelled or assumed — with a one-file contract for swapping in real EICV7 microdata.",
  },
] as const;

export default function MethodologyPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [poverty, setPoverty] = useState<PovertyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    apiGet<Meta>("/api/meta", "/api/meta.json")
      .then(setMeta)
      .catch((e: Error) => setError(e.message));
    apiGet<PovertyResponse>("/api/poverty", "/api/poverty.json")
      .then(setPoverty)
      .catch(() => {
        // The poverty block has its own empty state; a missing FGT payload should not blank
        // the model card and the reference tables that share this page.
      });
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // The API returns these together, but a stale or partial payload used to blank the whole
  // page: guard each optional section instead of assuming the shape.
  const importance = meta?.model_card?.importance ?? [];

  // Loading and empty are different answers. `meta` is the request's state; a missing
  // importance array is a resolved result and gets said out loud, not left as blank space.
  const pending = !error && !meta;

  // The committed model card has the logistic baseline ahead of the boosted model. The page
  // says so under the metrics table instead of reporting only the flattering number.
  const hgbAuc = meta?.model_card?.auc_gradient_boosting;
  const logitAuc = meta?.model_card?.auc_logistic_baseline;

  return (
    <div className="shell pt-10">
      <div className="max-w-[68ch] border-l-2 border-primary pl-5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="neutral">Method &amp; data</Tag>
        </div>
        <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[48px]">
          What is measured, what is modelled.
        </h1>
        <p className="mt-4 text-[19.5px] leading-[1.65] text-ink-soft">
          A hackathon prototype earns trust by being explicit about which numbers came from a
          statistical office and which came from us. This page draws that line, and states the
          assumptions behind every computed figure.
        </p>
      </div>

      {error ? (
        <div className="mt-8">
          <PanelState kind="error" onRetry={retry}>
            Could not load the method data — {error}
          </PanelState>
        </div>
      ) : null}

      {/* At a glance. The values come from the API, so they shimmer until it answers rather
          than printing committed numbers that would look like live output. */}
      <div
        role="group"
        aria-label="At a glance"
        aria-busy={pending || undefined}
        className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: "AUC (gradient boosting)", value: meta?.model_card?.auc_gradient_boosting?.toFixed(3) },
          { label: "Districts", value: meta ? "30" : undefined },
          { label: "Allocation rules", value: meta && String(meta.targeting_rules?.length ?? "") },
          {
            label: "Shock types",
            value: meta && String(Object.keys(meta.shock_assumptions ?? {}).length || ""),
          },
        ].map((s) => (
          <div key={s.label} className="border-l-2 border-primary pl-3">
            {pending ? (
              <Skeleton className="h-[26px] w-14" />
            ) : (
              <div className="tnum text-[26px] font-semibold leading-none text-ink">
                {s.value || "—"}
              </div>
            )}
            <div className="mt-1 text-[12.5px] leading-tight text-ink-soft">{s.label}</div>
          </div>
        ))}
      </div>

      {/* On this page — sticky, with the current section marked. A 3,800px reference page
          whose only navigation scrolls away is a page you read once. */}
      <SectionNav items={SECTIONS} />

      {/* Measured vs modelled. One ruled band, two registers: the page's argument is the line
          between them, so the boundary is drawn rather than implied by two floating cards. The
          measured register sits on white — a sheet of record — while the modelled register stays
          on the page ground, so the ground itself changes at the provenance line. Ground, rule,
          word size and count all carry the distinction, so it survives greyscale, print and a
          colour-blind reader; hue is the fourth cue, never the only one. */}
      <section
        id="measured"
        aria-label="What we read, and what we compute"
        className="mt-14 scroll-mt-[160px] sm:scroll-mt-[132px]"
      >
        <div className="border-l-2 border-primary pl-5 pt-1">
          <SectionHeading title="What we read, and what we compute">
            Every figure this prototype shows carries one of three provenance labels. This is the
            inventory behind all of them.
          </SectionHeading>
        </div>

        <FadeIn className="border-y-2 border-ink">
          <div className="grid md:grid-cols-2">
            {/* Read, never re-estimated. */}
            <div className="border-b border-line bg-surface p-5 sm:p-7 md:border-b-0 md:border-r">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="display-sm text-[21px] leading-tight">
                  <span
                    aria-hidden
                    className="mr-2.5 inline-block h-2 w-2 -translate-y-[2px] rounded-full bg-primary"
                  />
                  Measured · published
                </h3>
                <span className="tnum text-[13.5px] font-medium text-ink-soft">
                  6 published inputs
                </span>
              </div>
              <p className="mt-2 max-w-[48ch] text-[14.5px] leading-relaxed text-ink-soft">
                Read straight off the published tables and carried through unchanged — the
                prototype never re-estimates them.
              </p>
              <dl className="mt-4 divide-y divide-line/70 border-t border-line/70">
                <ProvenanceRow
                  what="Poverty headcount for all 30 districts, 2024 and 2017"
                  source="EICV7 Annex B"
                />
                <ProvenanceRow
                  what="Province and urban/rural poverty rates"
                  source="EICV7 Table 5.1"
                />
                <ProvenanceRow
                  what={
                    <>
                      Poverty lines: RWF{" "}
                      {num(
                        meta?.poverty_lines?.total_poverty_line_rwf_per_adult_equiv_year ?? 560127,
                      )}{" "}
                      and RWF{" "}
                      {num(
                        meta?.poverty_lines?.extreme_poverty_line_rwf_per_adult_equiv_year ??
                          356432,
                      )}
                    </>
                  }
                  source="EICV7 poverty profile, Jan 2024 prices"
                />
                <ProvenanceRow
                  what="District populations and household counts"
                  source="Census 2022"
                />
                <ProvenanceRow
                  what="Shock incidence and coping responses"
                  source="EICV7 Tables 6.10–6.11"
                />
                <ProvenanceRow
                  what="Financial inclusion, financial health and climate exposure"
                  source="FinScope 2024"
                />
              </dl>
            </div>

            {/* Computed here. Each marginal cell gives a row's size, its basis, or what it still
                lacks — whichever is the more useful thing to know about that output. */}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="display-sm text-[21px] leading-tight">
                  <span
                    aria-hidden
                    className="mr-2.5 inline-block h-2 w-2 -translate-y-[2px] rounded-full bg-accent"
                  />
                  Modelled · illustrative
                </h3>
                <span className="tnum text-[13.5px] font-medium text-ink-soft">
                  4 computed outputs
                </span>
              </div>
              <p className="mt-2 max-w-[48ch] text-[14.5px] leading-relaxed text-ink-soft">
                Computed by this prototype from the published inputs. Each row gives its size, its
                basis, or what it still lacks.
              </p>
              <dl className="mt-4 divide-y divide-line/70 border-t border-line/70">
                <ProvenanceRow
                  what="Household-level rows: synthetic, calibrated to published EICV7 marginals"
                  source={
                    meta?.microdata
                      ? `${num(meta.microdata.rows)} rows · seed ${meta.microdata.seed}`
                      : "Calibrated, not observed"
                  }
                />
                <ProvenanceRow
                  what="Poverty-risk model accuracy: measured on synthetic rows, not on Rwanda"
                  source="Not field-validated"
                />
                <ProvenanceRow
                  what="Cash-need estimates: a costing exercise, not a budget"
                  source="Costing only"
                />
                <ProvenanceRow
                  what="Resilience index: a constructed composite, not an official statistic"
                  source="Composite of modelled parts"
                />
              </dl>
              <p className="mt-4 border-l-2 border-accent pl-3 text-[14.5px] leading-relaxed text-ink-soft">
                {meta?.microdata?.note ?? MICRODATA_FALLBACK}
              </p>
            </div>
          </div>

          {/* The third label the site uses. A two-way split would file the shock parameters as
              "modelled", while the simulator and SourceNote already call them stated assumptions —
              so they get their own register, linked to the table that spells them out. */}
          <div className="border-t border-ink/20 bg-teal/5 px-5 py-4 sm:px-7">
            <h3 className="display-sm text-[17.5px] leading-tight">
              <span
                aria-hidden
                className="mr-2.5 inline-block h-2 w-2 -translate-y-[2px] rounded-full bg-teal"
              />
              Stated assumption
            </h3>
            <p className="mt-1.5 max-w-[82ch] text-[15px] leading-relaxed text-ink-soft">
              Shock exposure, loss and severity parameters are ours, not NISR&apos;s — stated
              openly so they can be challenged and replaced.{" "}
              <a
                href="#shocks"
                className="font-medium text-primary-deep underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
              >
                The full assumption table is below
              </a>
              .
            </p>
          </div>
        </FadeIn>
      </section>

      {/* Poverty measures. Headcount alone says how many are below the line but not how far
          below they sit, which is what a transfer budget has to cover. FGT gives all three from
          one formula (alpha = 0, 1, 2), so the numbers are comparable across areas and over time. */}
      <section
        id="poverty"
        aria-label="Poverty incidence, depth and severity"
        className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]"
      >
        <div className="border-l-2 border-primary pl-5 pt-1">
          <SectionHeading title="How many, how far below, how unequal">
            The Foster–Greer–Thorbecke family measures incidence, depth and severity with one
            parameter. Headcount alone can fall while the poorest get poorer; these three move
            together or not at all.
          </SectionHeading>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Headcount (P₀)",
              value: poverty ? pct(poverty.national.headcount_pct, 2) : undefined,
              note: "share of people below the total poverty line",
            },
            {
              label: "Poverty gap (P₁)",
              value: poverty ? pct(poverty.national.poverty_gap_pct, 2) : undefined,
              note: "average shortfall from the line, as a share of the line",
            },
            {
              label: "Severity (P₂)",
              value: poverty ? pct(poverty.national.severity_pct, 2) : undefined,
              note: "squared shortfall; weights the poorest more heavily",
            },
            {
              label: "Consumption Gini",
              value: poverty ? poverty.national.gini_consumption.toFixed(3) : undefined,
              note: "inequality across all households, not only the poor",
            },
          ].map((s) => (
            <div key={s.label} className="border-t-2 border-ink pt-3">
              <div className="text-[12.5px] font-medium uppercase tracking-[0.08em] text-ink-soft">
                {s.label}
              </div>
              <div className="tnum mt-1.5 text-[30px] font-semibold leading-none text-ink">
                {s.value ?? (poverty ? "—" : <Skeleton className="h-[30px] w-24" />)}
              </div>
              <p className="mt-2 text-[13.5px] leading-snug text-ink-soft">{s.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_1fr]">
          <div className="border border-line bg-surface p-5">
            <h3 className="label">The formula</h3>
            <p className="mt-2 font-mono text-[15px] leading-relaxed text-ink">
              P(α) = (1 / W) · Σ wᵢ · [ max(0, (z − yᵢ) / z) ]^α
            </p>
            <dl className="mt-4 space-y-2 text-[14.5px] leading-snug text-ink-soft">
              <div>
                <dt className="inline font-medium text-ink">z</dt>
                <dd className="inline">
                  {" "}
                  — poverty line, RWF {num(poverty?.lines.total_poverty_line_rwf ?? 560127)} per
                  adult equivalent per year (extreme line RWF{" "}
                  {num(poverty?.lines.extreme_poverty_line_rwf ?? 356432)})
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-ink">yᵢ</dt>
                <dd className="inline">
                  {" "}
                  — household consumption per adult equivalent
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-ink">wᵢ</dt>
                <dd className="inline">
                  {" "}
                  — household size, used as the per-capita weight
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-ink">α</dt>
                <dd className="inline"> — 0 headcount, 1 gap, 2 severity</dd>
              </div>
            </dl>
            <p className="mt-4 border-l-2 border-accent pl-3 text-[13.5px] leading-relaxed text-ink-soft">
              Weights here are household size, not EICV7 survey weights. The synthetic layer
              carries no strata or primary sampling units, so these are descriptive statistics
              about the prototype — not design-based national estimates.
            </p>
          </div>

          <div>
            <h3 className="text-[16px] font-semibold text-ink">Urban and rural</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[340px] border-collapse text-[15px]">
                <caption className="sr-only">
                  Headcount, poverty gap and severity for urban and rural households.
                </caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="pb-2 pr-4 text-left font-medium text-ink-soft">
                      Area
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium text-ink-soft">
                      Headcount
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium text-ink-soft">
                      Gap
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium text-ink-soft">
                      Severity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(poverty?.by_area ?? []).map((row) => (
                    <tr key={row.area}>
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {row.area}
                      </th>
                      <td className="tnum py-2 pr-4 text-right">{pct(row.headcount_pct, 2)}</td>
                      <td className="tnum py-2 pr-4 text-right">{pct(row.poverty_gap_pct, 2)}</td>
                      <td className="tnum py-2 text-right">{pct(row.severity_pct, 2)}</td>
                    </tr>
                  ))}
                  {poverty ? (
                    <tr className="font-medium">
                      <th scope="row" className="py-2 pr-4 text-left">
                        National
                      </th>
                      <td className="tnum py-2 pr-4 text-right">
                        {pct(poverty.national.headcount_pct, 2)}
                      </td>
                      <td className="tnum py-2 pr-4 text-right">
                        {pct(poverty.national.poverty_gap_pct, 2)}
                      </td>
                      <td className="tnum py-2 text-right">
                        {pct(poverty.national.severity_pct, 2)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {poverty ? (
              <>
                <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
                  Extreme poverty headcount:{" "}
                  <strong className="tnum font-medium text-ink">
                    {pct(poverty.national.headcount_extreme_pct, 2)}
                  </strong>
                  . Mean consumption per adult equivalent:{" "}
                  <strong className="tnum font-medium text-ink">
                    RWF {num(poverty.national.mean_consumption_ae_rwf)}
                  </strong>
                  ; median{" "}
                  <strong className="tnum font-medium text-ink">
                    RWF {num(poverty.national.median_consumption_ae_rwf)}
                  </strong>
                  .
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{poverty.note}</p>
              </>
            ) : !error ? (
              <SkeletonBars rows={3} />
            ) : null}
          </div>
        </div>
      </section>

      {/* Model card */}
      <section id="model" aria-label="Proxy-means poverty risk model" className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]">
        <div className="border-l-2 border-primary pl-5 pt-1">
          <SectionHeading title="Proxy-means poverty risk model">
            {meta?.model_card?.caveat}
          </SectionHeading>

          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <dl className="space-y-2 text-[16px]">
                <Row label="Algorithm" value={meta?.model_card?.algorithm ?? "—"} />
                <Row label="Target" value={meta?.model_card?.target ?? "—"} />
                <Row label="Training rows" value={num(meta?.model_card?.n_train)} />
                <Row label="Hold-out rows" value={num(meta?.model_card?.n_test)} />
                <Row
                  label="AUC (gradient boosting, hold-out)"
                  value={meta?.model_card?.auc_gradient_boosting?.toFixed(3) ?? "—"}
                />
                <Row
                  label="AUC (logistic baseline, hold-out)"
                  value={meta?.model_card?.auc_logistic_baseline?.toFixed(3) ?? "—"}
                />
              </dl>
              {hgbAuc != null && logitAuc != null && logitAuc > hgbAuc ? (
                <p className="mt-5 border border-line bg-surface px-4 py-3 text-[14.5px] leading-relaxed text-ink-soft">
                  Both AUCs are measured on the same {num(meta?.model_card?.n_test)} hold-out
                  rows. The logistic baseline scores marginally higher ({logitAuc.toFixed(3)}{" "}
                  against {hgbAuc.toFixed(3)}), so the boosted model should not be read as the
                  stronger classifier here.
                </p>
              ) : null}
              <div className="mt-6">
                <PullQuote label="Why consumption is excluded">
                  A proxy-means test has to rank households using things an enumerator can observe —
                  assets, housing, education, income source — not the welfare measure itself.
                </PullQuote>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-[16px] font-semibold text-ink">
                What drives the prediction
                <span className="ml-2 text-[14px] font-normal text-ink-soft">
                  (permutation importance, AUC loss)
                </span>
              </h3>
              {importance.length > 0 ? (
                <BarList
                  items={importance.slice(0, 9).map((i) => ({
                    label: i.feature,
                    value: i.importance,
                  }))}
                  format={(v) => v.toFixed(3)}
                  max={Math.max(...importance.map((i) => i.importance)) * 1.1}
                />
              ) : pending ? (
                <SkeletonBars rows={6} />
              ) : (
                <PanelState kind="empty">
                  The model card returned no feature importances.
                </PanelState>
              )}
              <SourceNote kind="modelled">
                Measured on the synthetic hold-out set, not on the Rwandan population.
              </SourceNote>
            </div>
          </div>
        </div>
      </section>

      {/* Targeting rules */}
      <section id="rules" aria-label="The five allocation rules" className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]">
        <div className="border-t border-line pt-6">
          <SectionHeading title="The five allocation rules" />
          <ol className="divide-y divide-line border-y border-line">
            {(meta?.targeting_rules ?? []).map((r, i) => (
              <li key={r.id} className="grid grid-cols-[28px_1fr] gap-x-3 py-3">
                <span className="tnum text-[14px] font-semibold text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="text-[17.5px] font-semibold">{r.label}</div>
                  <p className="mt-0.5 max-w-[75ch] text-[15.5px] leading-relaxed text-ink-soft">
                    {r.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Shock assumptions */}
      <section id="shocks" aria-label="Shock assumption table" className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]">
        <div className="border-t border-line pt-6">
          <SectionHeading title="Shock assumption table" />
          {/* Table and its reading sit side by side: on a wide screen a 720px table left in a
              1,280px column leaves the explanation stranded underneath. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)] lg:gap-10">
            <div
              // Three columns do not fit 375px, so the table scrolls. Making the scroller
              // focusable is what lets a keyboard user do the scrolling; the global
              // :focus-visible ring is the cue that it can.
              role="region"
              aria-label="Shock assumption table"
              tabIndex={0}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[420px] border-collapse text-[15.5px]">
                <caption className="sr-only">
                  Exposure and consumption loss assumed for each shock type, at severity 100.
                </caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="pb-2 text-left text-[12.5px] font-medium text-ink-soft">
                      Shock
                    </th>
                    <th scope="col" className="pb-2 text-right text-[12.5px] font-medium text-ink-soft">
                      Exposure
                    </th>
                    <th scope="col" className="pb-2 text-right text-[12.5px] font-medium text-ink-soft">
                      Loss at severity 100
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(meta?.shock_assumptions ?? {}).map(([id, a]) => (
                    <tr key={id}>
                      <th scope="row" className="py-2 text-left font-normal">
                        {a.label}
                      </th>
                      <td className="tnum py-2 text-right">{pct(a.exposure * 100, 0)}</td>
                      <td className="tnum py-2 text-right">{pct(a.loss * 100, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-ink-soft">
              {meta?.severity_note} Resilience absorbs part of the loss: households with savings,
              mobile money and insurance retain more consumption. Parameters are deliberately simple
              and visible so they can be challenged and replaced.
            </p>
          </div>
        </div>
      </section>

      {/* National alignment. Sits after the method and before the sources: by this point the
          reader knows what is computed, so the only open question is whose decision it serves. */}
      <section
        id="alignment"
        aria-label="National alignment"
        className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]"
      >
        <div className="border-t border-line pt-6">
          <SectionHeading title="Where this sits in national policy">
            Each row names a national instrument, what it asks for, and the part of IMBERE that
            answers it.
          </SectionHeading>
          <div
            role="region"
            aria-label="National priority alignment table"
            tabIndex={0}
            className="overflow-x-auto"
          >
            <table className="w-full min-w-[680px] border-collapse text-[15.5px]">
              <caption className="sr-only">
                Mapping from NST2 and Vision 2050 priorities to the IMBERE module that addresses
                each one.
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th
                    scope="col"
                    className="pb-2 pr-4 text-left text-[12.5px] font-medium text-ink-soft"
                  >
                    Instrument
                  </th>
                  <th
                    scope="col"
                    className="pb-2 pr-4 text-left text-[12.5px] font-medium text-ink-soft"
                  >
                    What it asks for
                  </th>
                  <th
                    scope="col"
                    className="pb-2 text-left text-[12.5px] font-medium text-ink-soft"
                  >
                    What IMBERE answers
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ALIGNMENT.map((row) => (
                  <tr key={row.instrument}>
                    <th
                      scope="row"
                      className="py-3 pr-4 text-left align-top font-semibold text-ink"
                    >
                      {row.instrument}
                    </th>
                    <td className="py-3 pr-4 align-top text-ink-soft">{row.asks}</td>
                    <td className="py-3 align-top">{row.answers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Sources */}
      <section id="sources" aria-label="Sources" className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]">
        <div className="border-t border-line pt-6">
          <SectionHeading title="Sources" />
          <ul className="max-w-[1000px] divide-y divide-line border-y border-line">
            {(meta?.sources ?? []).map((s) => (
              <li
                key={s.id}
                className="grid grid-cols-1 gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[17.5px] font-semibold text-primary-deep underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
                  >
                    {s.title}
                    <svg
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14 5h5m0 0v5m0-5L10 14m-4 5h11a2 2 0 002-2v-4"
                      />
                    </svg>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  {/* Publisher on its own line for every row. Inline, it fits three of the four
                      sources and wraps only the longest pair, which reads as a layout bug rather
                      than as a two-line entry. */}
                  <div className="mt-0.5 text-[14.5px] leading-snug text-ink-soft">
                    {s.publisher} · {s.year}
                  </div>
                </div>
                <span className="justify-self-start rounded-sm border border-line px-2 py-0.5 text-[12px] uppercase tracking-[0.12em] text-ink-soft sm:justify-self-end">
                  {s.license}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Limits */}
      <section id="limits" aria-label="Known limitations" className="mt-16 scroll-mt-[160px] sm:scroll-mt-[132px]">
        <div className="border-t border-line pt-6">
          <SectionHeading title="Known limitations" />
          <ul className="space-y-3 text-[16px] leading-relaxed text-ink-soft">
            <li className="grid gap-x-4 gap-y-1 sm:grid-cols-[210px_minmax(0,74ch)]">
              <strong className="font-semibold text-ink">Synthetic households</strong>
              <span>
                Rankings, AUC and cost figures describe the prototype. Loading the EICV7 file
                replaces the rows without touching the engines.
              </span>
            </li>
            <li className="grid gap-x-4 gap-y-1 sm:grid-cols-[210px_minmax(0,74ch)]">
              <strong className="font-semibold text-ink">FinScope is national</strong>
              <span>
                FinScope 2024 does not publish district estimates, so financial-health figures are
                national. District financial access comes from the EICV7 mobile-money and savings
                modules instead.
              </span>
            </li>
            <li className="grid gap-x-4 gap-y-1 sm:grid-cols-[210px_minmax(0,74ch)]">
              <strong className="font-semibold text-ink">Sample sizes are modest</strong>
              <span>
                EICV7 covers roughly 500 households per district, so confidence intervals are wide.
                Only 17 of 30 districts had a statistically significant poverty reduction.
              </span>
            </li>
            <li className="grid gap-x-4 gap-y-1 sm:grid-cols-[210px_minmax(0,74ch)]">
              <strong className="font-semibold text-ink">No causal claim</strong>
              <span>
                The targeting comparison shows selection performance, not programme impact.
                Cash-need figures are a costing exercise at the poverty line, not an evaluation.
              </span>
            </li>
            <li className="grid gap-x-4 gap-y-1 sm:grid-cols-[210px_minmax(0,74ch)]">
              <strong className="font-semibold text-ink">AI disclosure</strong>
              <span>
                Built with AI assistance for code generation and drafting. All data transcription,
                formulas and assumptions were reviewed by the team, who take full responsibility
                for the submission.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 pb-2">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      {/* A class name such as HistGradientBoostingClassifier is one unbreakable token. `break-word`
          alone does not shrink a flex item's min-content width, so the value needs
          `overflow-wrap: anywhere` to keep the row inside a phone screen. */}
      <dd className="tnum min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

/**
 * One provenance-inventory row: the figure on the left, its standing on the right. The right
 * cell holds a source for published inputs and a status for modelled outputs.
 *
 * The marginalia column only engages at `lg`. Below that the band has already split into two
 * half-width registers, and a 38-character citation in Comfortaa takes ~285px of a ~308px
 * content box, which would leave the figure one word per line. Stacked, the source reads as a
 * caption beneath its figure instead.
 * `dl > div > dt + dd` is valid HTML, and the wrapper is what lets the pair become a grid.
 */
function ProvenanceRow({ what, source }: { what: ReactNode; source: ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-0.5 py-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-baseline">
      <dt className="max-w-[46ch] text-[16px] leading-snug text-ink">{what}</dt>
      <dd className="text-[13.5px] leading-snug text-ink-soft lg:text-right">{source}</dd>
    </div>
  );
}
