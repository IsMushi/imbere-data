"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FadeIn } from "@/components/Motion";
import {
  Kpi,
  Ledger,
  PanelState,
  SectionHeading,
  SkeletonKpi,
  SkeletonTableRows,
  SourceNote,
  Tag,
} from "@/components/Ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, type ProofResponse, type ProofRow } from "@/lib/api";
import { num, pct, signed } from "@/lib/format";

/** Short publisher labels. The full citation and link sit in the source list at the end. */
const SOURCE_LABEL: Record<string, string> = {
  eicv7_poverty_profile: "NISR · EICV7 profile",
  eicv7_tables: "NISR · EICV7 tables",
  finscope2024: "AFR · FinScope 2024",
  census2022: "NISR · Census 2022",
};

function value(row: ProofRow, n: number): string {
  return row.unit === "%" ? pct(n, 1) : num(n, 1);
}

function gap(row: ProofRow): string {
  const d = signed(row.difference, 1);
  return row.unit === "%" ? `${d} pp` : d;
}

export default function ProofPage() {
  const [proof, setProof] = useState<ProofResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    apiGet<ProofResponse>("/api/proof", "/api/proof.json")
      .then(setProof)
      .catch((e: Error) => setError(e));
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const pending = !proof && !error;

  const worstTarget = useMemo(() => {
    const targets = proof?.rows.filter((r) => r.role === "target") ?? [];
    return targets.reduce((m, r) => Math.max(m, Math.abs(r.difference)), 0);
  }, [proof]);

  const worstProvince = useMemo(
    () => proof?.provinces.reduce((m, p) => Math.max(m, Math.abs(p.difference)), 0) ?? 0,
    [proof],
  );

  const sizeRow = proof?.rows.find((r) => r.id === "household_size");

  // A point or more is worth a card; anything smaller is inside the rounding step of a published
  // one-decimal figure. Household size has its own card below, so it is not repeated here.
  const gaps = useMemo(
    () =>
      proof?.rows.filter((r) => r.id !== "household_size" && Math.abs(r.difference) >= 1) ?? [],
    [proof],
  );

  return (
    <div className="shell pt-10">
      <div className="max-w-[68ch]">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="real">Published values are NISR and FinScope</Tag>
          <Tag tone="modelled">Synthetic values come from our generator</Tag>
        </div>
        <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[48px]">
          Can a synthetic Rwanda be checked against the real one?
        </h1>
        <p className="mt-4 text-[19.5px] leading-[1.65] text-ink-soft">
          The model and the simulator run on household rows we generated, not on NISR microdata.
          That is only defensible if the generated population reproduces the published figures.
          This page puts the two side by side, reading both from the API, and says where they part
          company.
        </p>
      </div>

      {error ? (
        <div className="mt-8">
          <PanelState kind="error" onRetry={retry}>
            Could not load the comparison — {error.message}
          </PanelState>
        </div>
      ) : null}

      {pending ? (
        <div className="mt-8" aria-busy>
          <Ledger>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonKpi key={i} />
            ))}
          </Ledger>
        </div>
      ) : null}

      {proof ? (
        <div className="mt-8">
          <Ledger>
            <Kpi
              label="Indicators compared"
              value={proof.rows.length}
              note="Every row computed by the API, none typed here"
            />
            <Kpi
              label="Largest calibration gap"
              value={`${worstTarget.toFixed(1)} pp`}
              note="Worst row that was fitted by the generator"
            />
            <Kpi
              label="Province rates within"
              value={`${worstProvince.toFixed(1)} pp`}
              note="Five published province poverty rates"
            />
            <Kpi
              label="Synthetic households"
              value={num(proof.generated.rows)}
              note={`${proof.generated.round} ${proof.generated.fieldwork}, seed ${proof.generated.seed}`}
            />
          </Ledger>
        </div>
      ) : null}

      <section className="mt-14" aria-label="Indicator by indicator">
        <SectionHeading module="01" title="Indicator by indicator">
          Rows marked <em>target</em> were tuned by the generator, so a near-zero gap confirms the
          calibration ran and nothing more. Rows marked <em>emergent</em> were not tuned: that is
          where this table can surprise us.
        </SectionHeading>

        <Table className="min-w-[720px]">
          <TableCaption className="text-left">
            Published {proof?.generated.round ?? "EICV7"} and FinScope figures beside the same
            statistic in the synthetic household layer.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Indicator</TableHead>
              <TableHead scope="col" className="text-right">
                Published
              </TableHead>
              <TableHead scope="col" className="text-right">
                Synthetic
              </TableHead>
              <TableHead scope="col" className="text-right">
                Difference
              </TableHead>
              <TableHead scope="col">Compared as</TableHead>
              <TableHead scope="col">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proof ? (
              proof.rows.map((r) => (
                <TableRow key={r.id}>
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {r.label}
                  </th>
                  <TableCell className="tnum py-3 text-right">{value(r, r.published)}</TableCell>
                  <TableCell className="tnum py-3 text-right">{value(r, r.synthetic)}</TableCell>
                  <TableCell className="tnum py-3 text-right font-medium">{gap(r)}</TableCell>
                  <TableCell className="py-3 text-[13.5px] text-ink-soft">
                    {r.role === "target" ? "Calibration target" : "Emergent"}
                  </TableCell>
                  <TableCell className="py-3 text-[13.5px] text-ink-soft">
                    {SOURCE_LABEL[r.source] ?? r.source}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <SkeletonTableRows rows={8} cols={6} />
            )}
          </TableBody>
        </Table>
      </section>

      <section className="mt-14" aria-label="Where the synthetic layer disagrees">
        <SectionHeading module="02" title="Where the synthetic layer disagrees">
          {gaps.length === 1
            ? "One row differs from the published figure by a point or more. Everything else is inside a rounding step."
            : gaps.length > 1
              ? `${gaps.length} rows differ from the published figure by a point or more. Everything else is inside a rounding step.`
              : "No row differs from its published figure by a point or more."}
        </SectionHeading>
        <div className="grid gap-6 md:grid-cols-2">
          {gaps.map((r) => (
            <div key={r.id} className="border-l-2 border-accent pl-4">
              <div className="label">{r.label}</div>
              <div className="tnum mt-1 text-[26px] font-semibold text-ink">
                {`${value(r, r.synthetic)} vs ${value(r, r.published)}`}
              </div>
              <p className="mt-2 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
                {r.note ??
                  (r.id === "modern_floor" ? (
                    <>
                      Assets are drawn with a shared latent factor so they stay correlated within a
                      household. The correlation pulls the floor rate{" "}
                      {Math.abs(r.difference).toFixed(1)} points below its published share. It is an
                      asset indicator, so it does not enter the poverty headcount.
                    </>
                  ) : (
                    "This row was not fitted, so the gap is what the calibration could not reach."
                  ))}
              </p>
            </div>
          ))}
          <div className="border-l-2 border-line pl-4">
            <div className="label">Average household size</div>
            <div className="tnum mt-1 text-[26px] font-semibold text-ink">
              {sizeRow ? `${sizeRow.synthetic.toFixed(1)} vs ${sizeRow.published.toFixed(1)}` : "—"}
            </div>
            <p className="mt-2 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
              {sizeRow?.note ??
                "Household sizes are drawn so the mean lands on the published average."}
            </p>
          </div>
        </div>
        <SourceNote kind="modelled">
          Gaps are computed by the API from the committed data, so this list changes when the data
          does.
        </SourceNote>
      </section>

      <section className="mt-14" aria-label="Poverty by province">
        <SectionHeading module="03" title="Poverty by province">
          District poverty rates are the calibration target, so province rates are the first place a
          district-level fit can break down.
        </SectionHeading>
        <Table className="min-w-[520px]">
          <TableCaption className="text-left">
            Published province poverty rates against the synthetic household layer, EICV7 2023/24.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Province</TableHead>
              <TableHead scope="col" className="text-right">
                Published
              </TableHead>
              <TableHead scope="col" className="text-right">
                Synthetic
              </TableHead>
              <TableHead scope="col" className="text-right">
                Difference
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proof ? (
              proof.provinces.map((p) => (
                <TableRow key={p.province}>
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    {p.province}
                  </th>
                  <TableCell className="tnum py-3 text-right">{pct(p.published, 1)}</TableCell>
                  <TableCell className="tnum py-3 text-right">{pct(p.synthetic, 1)}</TableCell>
                  <TableCell className="tnum py-3 text-right font-medium">
                    {signed(p.difference, 1)} pp
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <SkeletonTableRows rows={5} cols={4} />
            )}
          </TableBody>
        </Table>
      </section>

      <section className="mt-14" aria-label="How the synthetic rows were made">
        <SectionHeading module="04" title="How the synthetic rows were made">
          Everything below happens in <code className="text-ink">scripts/build_data.py</code>, which
          is committed, so any of it can be re-run and checked.
        </SectionHeading>
        <ol className="max-w-[80ch] space-y-4">
          {[
            [
              "District targets",
              "Households are allocated to the 30 districts in proportion to Census 2022 population, and the poverty model is fitted so each district lands on its published EICV7 rate.",
            ],
            [
              "Education and income",
              "Education level and main income source are drawn from published marginals by poverty status (EICV7 Tables 6.6–6.11), which sets the joint distribution the model then consumes.",
            ],
            [
              "Assets and shocks",
              "Asset ownership and shock exposure are drawn with a Gaussian copula: each asset hits its published share while assets stay correlated within a household.",
            ],
            [
              "Consumption",
              "Consumption per adult equivalent follows from the calibrated model; the poverty and extreme-poverty flags are the published lines applied to it. Financial-health bands are imposed at the published FinScope split.",
            ],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="tnum text-[14px] font-semibold text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[16px] leading-relaxed text-ink-soft">
                <span className="font-medium text-ink">{title}. </span>
                {body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14" aria-label="What the synthetic data can and cannot show">
        <SectionHeading module="05" title="What this can and cannot show" />
        <div className="grid gap-8 md:grid-cols-2">
          <FadeIn>
            <h3 className="label">Can show</h3>
            <ul className="mt-3 space-y-2 text-[15.5px] leading-relaxed text-ink-soft">
              <li>The arithmetic of a targeting rule: who it enrols, what it costs, whom it misses.</li>
              <li>How a shock of a given size moves households across the poverty line, given the assumed exposure and loss.</li>
              <li>Whether a ranking built from observable characteristics beats one built from district averages.</li>
            </ul>
          </FadeIn>
          <FadeIn delay={0.05}>
            <h3 className="label">Cannot show</h3>
            <ul className="mt-3 space-y-2 text-[15.5px] leading-relaxed text-ink-soft">
              <li>The real joint distribution of assets, income and consumption in Rwanda.</li>
              <li>A publishable accuracy figure. The hold-out scores describe this prototype.</li>
              <li>Anything causal: a shock table is an assumption, not an estimate of what a drought will do.</li>
            </ul>
          </FadeIn>
        </div>
      </section>

      <section className="mt-14" aria-label="Swapping in real microdata">
        <div className="border border-line bg-surface px-5 py-4">
          <p className="text-[16px] leading-relaxed text-ink">
            If you have access to real EICV7 microdata, the model can be re-run with it. No code
            change is needed except the data file.
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            The swap contract — required columns, the poverty lines, and what has to be re-fitted —
            is in{" "}
            <a
              className="font-medium text-primary-deep underline underline-offset-2"
              href="/methodology#measured"
            >
              the method page
            </a>
            .
          </p>
        </div>
      </section>

      <section className="mt-14" aria-label="Sources">
        <SectionHeading module="06" title="Sources compared here">
          Every link below is served by the API alongside the values, so the citation and the figure
          cannot drift apart.
        </SectionHeading>
        <ul className="space-y-3">
          {(proof?.sources ?? []).map((s) => (
            <li key={s.id} className="text-[15px] leading-relaxed">
              <a
                className="font-medium text-primary-deep underline underline-offset-2"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                {s.title}
              </a>
              <span className="text-ink-soft">
                {" "}
                — {s.publisher}, {s.year} · {s.license}
              </span>
            </li>
          ))}
        </ul>
        {pending ? <Skeleton className="mt-2 h-[16px] w-64" /> : null}
        <p className="mt-6 text-[14px] text-ink-soft">
          The full traceability matrix, including which file each figure lives in, is in{" "}
          <a
            className="font-medium text-primary-deep underline underline-offset-2"
            href="/sources"
          >
            sources
          </a>
          .
        </p>
      </section>
    </div>
  );
}
