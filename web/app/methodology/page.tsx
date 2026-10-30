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
import { apiGet, type Meta } from "@/lib/api";
import { num, pct } from "@/lib/format";

/** Module scope on purpose: `SectionNav` keys its scroll listener on this array. */
const SECTIONS = [
  { href: "#measured", label: "Measured vs modelled" },
  { href: "#model", label: "Proxy-means model" },
  { href: "#rules", label: "Allocation rules" },
  { href: "#shocks", label: "Shock assumptions" },
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

export default function MethodologyPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    apiGet<Meta>("/api/meta")
      .then(setMeta)
      .catch((e: Error) => setError(e.message));
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
                  label="AUC (gradient boosting)"
                  value={meta?.model_card?.auc_gradient_boosting?.toFixed(3) ?? "—"}
                />
                <Row
                  label="AUC (logistic baseline)"
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
