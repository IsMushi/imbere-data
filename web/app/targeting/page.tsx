"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FadeIn } from "@/components/Motion";
import { BarList } from "@/components/BarList";

import {
  Kpi,
  Ledger,
  PanelState,
  PullQuote,
  SectionHeading,
  SkeletonBars,
  SkeletonKpi,
  SkeletonTableRows,
  SourceNote,
  Tag,
} from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, type Meta, type TargetingResponse } from "@/lib/api";
import { num, pct, rwf, rwfValue } from "@/lib/format";

const COLORS: Record<string, string> = {
  universal: "#acaeb0",
  geographic: "#5b93c4",
  community: "#008482",
  financial_exclusion: "#c95100",
  pmt: "#005cab",
};

const DEFAULT_BUDGET = 300_000_000;
const DEFAULT_TRANSFER = 150_000;

/** A display string for a slider bound, e.g. RWF 50m rather than RWF 50.0m. */
function bound(n: number): string {
  return rwf(n).replace(".0m", "m").replace(".0bn", "bn").replace(".0k", "k");
}

export default function TargetingPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [transfer, setTransfer] = useState(DEFAULT_TRANSFER);
  const [data, setData] = useState<TargetingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    apiGet<Meta>("/api/meta", "/api/meta.json").then(setMeta).catch((e: Error) => setError(e.message));
  }, [attempt]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      apiPost<TargetingResponse>("/api/targeting", {
        budget_total: budget,
        transfer_per_beneficiary: transfer,
      })
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 140);
    return () => clearTimeout(t);
  }, [budget, transfer, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Parameters that differ from the documented default. The reset link only exists while
  // something is off-default, so the rail does not carry a permanently inert control.
  const changed = budget !== DEFAULT_BUDGET || transfer !== DEFAULT_TRANSFER;
  const reset = useCallback(() => {
    setBudget(DEFAULT_BUDGET);
    setTransfer(DEFAULT_TRANSFER);
  }, []);

  // A refetch keeps the previous result on screen so the page does not collapse into a
  // spinner mid-drag; `stale` is what dims it and what the status line announces.
  const stale = loading && data !== null;

  // First answer has not arrived yet: the rail's computed figures are placeholders, not zeroes.
  const firstLoad = !data && !error;

  const ranked = useMemo(() => {
    if (!data) return [];
    return [...data.results].sort(
      (a, b) => (a.cost_per_poor_reached ?? Infinity) - (b.cost_per_poor_reached ?? Infinity),
    );
  }, [data]);

  // Export the table currently on screen, at the parameters currently on screen. The CSV is
  // built from the response rather than reread from the API, so what a district officer files
  // is what they were looking at. It carries the synthetic-data caveat as its first line so a
  // spreadsheet opened months later cannot be mistaken for a survey extract.
  const exportCsv = useCallback(() => {
    if (!data) return;
    const header = [
      "rule",
      "label",
      "beneficiaries",
      "poor_reached",
      "non_poor_reached",
      "targeting_accuracy_pct",
      "coverage_of_poor_pct",
      "coverage_ci95_low",
      "coverage_ci95_high",
      "leakage_rate_pct",
      "exclusion_error_pct",
      "spend_rwf",
      "cost_per_poor_reached_rwf",
      "districts_reached",
      "share_to_10_poorest_pct",
      "fairness_ratio",
    ];
    const esc = (v: string | number | null | undefined) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      `# IMBERE DATA targeting allocation — calibrated synthetic households (${data.sample_households} rows), not EICV7 survey microdata`,
      `# budget_rwf=${data.budget_total} transfer_per_beneficiary_rwf=${data.transfer_per_beneficiary} bootstrap_reps=${data.bootstrap_reps}`,
      header.join(","),
    ];
    for (const r of ranked) {
      const f = data.fairness?.[r.id];
      lines.push(
        [
          r.id,
          r.label,
          r.beneficiaries,
          r.poor_reached,
          r.non_poor_reached,
          r.targeting_accuracy,
          r.coverage_of_poor,
          r.ci95.coverage_of_poor?.[0],
          r.ci95.coverage_of_poor?.[1],
          r.leakage_rate,
          r.exclusion_error,
          r.spend_rwf,
          r.cost_per_poor_reached,
          f?.districts_reached,
          f?.share_to_poorest_decile,
          f?.fairness_ratio,
        ]
          .map(esc)
          .join(","),
      );
    }
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imbere-targeting-${Math.round(data.budget_total / 1e6)}m-${Math.round(
      data.transfer_per_beneficiary / 1e3,
    )}k.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [data, ranked]);

  const pmt = data?.results.find((r) => r.id === "pmt");
  const universal = data?.results.find((r) => r.id === "universal");
  const ratio =
    pmt?.cost_per_poor_reached && universal?.cost_per_poor_reached
      ? universal.cost_per_poor_reached / pmt.cost_per_poor_reached
      : null;

  const series = useMemo(
    () =>
      (data?.results ?? []).map((r) => ({
        id: r.id,
        label: r.label,
        color: COLORS[r.id] ?? "#8a949c",
      })),
    [data],
  );

  const maxCoverage = data ? Math.max(...data.results.map((r) => r.coverage_of_poor)) : 1;
  const beneficiaries = Math.min(Math.floor(budget / transfer), data?.sample_households ?? Infinity);

  return (
    <div className="shell pt-10">
      <div className="max-w-[68ch]">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="modelled" className="whitespace-normal leading-tight">
            Household rows are calibrated synthetic
          </Tag>
        </div>
        <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[48px]">
          Same budget. Different poor people.
        </h1>
        <p className="mt-4 text-[19.5px] leading-[1.65] text-ink-soft">
          Targeting is where social-protection money is won or lost. IMBERE runs five allocation
          rules over the same household distribution and reports who actually gets reached —
          accuracy, coverage, leakage and cost per poor person.
        </p>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Controls rail. Sticky on desktop, offset below the 76px header rather than under it. */}
        <div className="h-fit lg:sticky lg:top-[92px]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label">Programme parameters</h2>
            {changed ? (
              <button
                type="button"
                onClick={reset}
                className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
              >
                Reset
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-7 border-t border-line pt-5">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="budget">Budget</Label>
                <span className="tnum rounded-[3px] bg-primary-soft px-2 py-0.5 text-[14.5px] font-semibold text-primary-deep">
                  {bound(budget)}
                </span>
              </div>
              <Slider
                id="budget"
                className="mt-3"
                value={[budget]}
                onValueChange={([v]) => setBudget(v)}
                min={50_000_000}
                max={2_000_000_000}
                step={50_000_000}
                thumbLabel="Budget"
                valueText={bound(budget)}
              />
              <div className="tnum mt-1.5 flex justify-between text-[12px] text-ink-soft">
                <span>{bound(50_000_000)}</span>
                <span>{bound(2_000_000_000)}</span>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="transfer">Transfer amount</Label>
                <span className="tnum rounded-[3px] bg-primary-soft px-2 py-0.5 text-[14.5px] font-semibold text-primary-deep">
                  {bound(transfer)}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
                Paid once a year to each selected household.
              </p>
              <Slider
                id="transfer"
                className="mt-3"
                value={[transfer]}
                onValueChange={([v]) => setTransfer(v)}
                min={50_000}
                max={400_000}
                step={25_000}
                thumbLabel="Transfer per beneficiary per year"
                valueText={bound(transfer)}
              />
              <div className="tnum mt-1.5 flex justify-between text-[12px] text-ink-soft">
                <span>{bound(50_000)}</span>
                <span>{bound(400_000)}</span>
              </div>
            </div>
          </div>

          <div
            role="status"
            aria-live="polite"
            className="mt-4 flex min-h-5 items-center gap-2 text-[12.5px] text-ink-soft"
          >
            {stale ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                Updating for {bound(budget)} and {bound(transfer)}…
              </>
            ) : data ? (
              <>Showing {bound(data.budget_total)} at {bound(data.transfer_per_beneficiary)} per household.</>
            ) : null}
          </div>

          <dl className="mt-3 space-y-2 border-t border-line pt-4 text-[15.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Beneficiaries</dt>
              <dd className="tnum font-medium">
                {data ? (
                  num(beneficiaries)
                ) : firstLoad ? (
                  <Skeleton className="h-[15px] w-14" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Caseload</dt>
              <dd className="tnum font-medium">
                {data ? (
                  pct((beneficiaries / data.sample_households) * 100, 1)
                ) : firstLoad ? (
                  <Skeleton className="h-[15px] w-12" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Poor in sample</dt>
              <dd className="tnum font-medium">
                {data ? (
                  num(data.total_poor_in_sample)
                ) : firstLoad ? (
                  <Skeleton className="h-[15px] w-14" />
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <SourceNote kind="modelled">
            Selection runs on {data ? num(data.sample_households) : "—"} calibrated synthetic
            households, not on EICV7 microdata.
          </SourceNote>
        </div>

        {/* Results */}
        <div
          aria-busy={stale || undefined}
          className={`transition-opacity duration-200 ${stale ? "opacity-60" : "opacity-100"}`}
        >
          {error ? (
            data ? (
              <div
                role="alert"
                className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-accent bg-accent/[0.06] px-3 py-2 text-[13.5px] text-ink"
              >
                Could not recompute for these parameters. Showing the last result.
                <button
                  type="button"
                  onClick={retry}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : (
              <PanelState kind="error" onRetry={retry}>
                Could not compute targeting
              </PanelState>
            )
          ) : !data ? (
            <TargetingSkeleton />
          ) : null}

          {pmt && universal ? (
            <section aria-label="Headline results">
              <Ledger>
                <Kpi
                  label="Proxy-means accuracy"
                  value={pct(pmt.targeting_accuracy, 1)}
                  note="share of beneficiaries who are actually poor"
                  tone="primary"
                />
                <Kpi
                  label="Poor reached"
                  value={pct(pmt.coverage_of_poor, 1)}
                  note={`of all poor households, vs ${pct(universal.coverage_of_poor, 1)} universal`}
                />
                <Kpi
                  label="Leakage"
                  value={pct(pmt.leakage_rate, 1)}
                  note={`vs ${pct(universal.leakage_rate, 1)} under universal allocation`}
                  tone="accent"
                />
                <Kpi
                  label="Cost per poor reached (RWF)"
                  value={rwfValue(pmt.cost_per_poor_reached)}
                  note={ratio ? `${ratio.toFixed(1)}× cheaper than universal` : undefined}
                />
              </Ledger>
            </section>
          ) : null}

          {/* Ranked table */}
          <section className="mt-9" aria-label="Allocation rules">
            <SectionHeading title="Ranked by cost per poor person reached">
              Cheapest first. Every rule spends exactly the same budget on exactly the same number
              of beneficiaries — only the selection differs.
            </SectionHeading>

            <FadeIn>
              {/* Phones get the same five rows as stacked cards. The comparison does not
                  depend on column alignment, and this avoids hiding coverage, leakage and
                  cost off the right edge of a horizontally scrolling table. */}
              <ol className="space-y-3 md:hidden">
                {ranked.map((r, i) => {
                  const best = r.id === "pmt";
                  return (
                    <li
                      key={r.id}
                      className={`rounded-lg border p-4 ${
                        best ? "border-primary/35 bg-primary-soft/30" : "border-line bg-surface"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="tnum text-[13px] text-ink-soft">{i + 1}</span>
                          <h3 className="text-[16px] font-medium leading-snug text-ink">{r.label}</h3>
                        </div>
                        {best ? <Tag tone="real">Lowest cost</Tag> : null}
                      </div>
                      <p className="mt-2 text-[13.5px] leading-snug text-ink-soft">{r.description}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-ink-soft">Accuracy</dt>
                          <dd className="tnum font-medium">{pct(r.targeting_accuracy, 1)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-ink-soft">Coverage</dt>
                          <dd className="tnum font-medium">{pct(r.coverage_of_poor, 1)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-ink-soft">Leakage</dt>
                          <dd className="tnum font-medium">{pct(r.leakage_rate, 1)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-ink-soft">Cost / poor</dt>
                          <dd className="tnum font-medium">{rwf(r.cost_per_poor_reached)}</dd>
                        </div>
                      </dl>
                      {r.ci95?.coverage_of_poor ? (
                        <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">
                          95% interval — coverage {pct(r.ci95.coverage_of_poor[0], 1)}–
                          {pct(r.ci95.coverage_of_poor[1], 1)}, leakage{" "}
                          {pct(r.ci95.leakage_rate?.[0] ?? 0, 1)}–
                          {pct(r.ci95.leakage_rate?.[1] ?? 0, 1)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              <div className="hidden md:block">
                <Table className="min-w-[600px]">
                  <TableCaption>
                    Five allocation rules ranked by cost per poor person reached, with targeting
                    accuracy, coverage of poor households and leakage.
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col" className="w-8">
                        #
                      </TableHead>
                      <TableHead scope="col">Rule</TableHead>
                      <TableHead scope="col" className="text-right">
                        Accuracy
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Coverage
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Leakage
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Cost / poor
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranked.map((r, i) => {
                      const best = r.id === "pmt";
                      return (
                        <TableRow key={r.id} className={best ? "bg-primary-soft/40" : undefined}>
                          <TableCell className="tnum py-3 align-top text-[13px] text-ink-soft">
                            {i + 1}
                          </TableCell>
                          <th scope="row" className="py-3 pr-6 text-left font-normal align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[16px] font-medium text-ink">{r.label}</span>
                              {best ? <Tag tone="real">Lowest cost</Tag> : null}
                            </div>
                            <p className="mt-1 max-w-[46ch] text-[14px] leading-snug text-ink-soft">
                              {r.description}
                            </p>
                          </th>
                          <TableCell className="tnum py-3 text-right align-top">
                            {pct(r.targeting_accuracy, 1)}
                          </TableCell>
                          <TableCell className="py-3 text-right align-top">
                            <span className="tnum">{pct(r.coverage_of_poor, 1)}</span>
                            {r.ci95?.coverage_of_poor ? (
                              <span className="block text-[12px] text-ink-soft">
                                {pct(r.ci95.coverage_of_poor[0], 1)}–{pct(r.ci95.coverage_of_poor[1], 1)}
                              </span>
                            ) : null}
                            <span
                              className="ml-auto mt-1.5 block h-[4px] w-16 overflow-hidden rounded-full bg-line/70"
                              aria-hidden
                            >
                              <span
                                className={`block h-full rounded-full ${
                                  best ? "bg-primary" : "bg-primary/45"
                                }`}
                                style={{
                                  width: `${Math.max(3, (r.coverage_of_poor / maxCoverage) * 100)}%`,
                                }}
                              />
                            </span>
                          </TableCell>
                          <TableCell className="tnum py-3 text-right align-top">
                            {pct(r.leakage_rate, 1)}
                          </TableCell>
                          <TableCell className="tnum py-3 text-right align-top font-medium">
                            {rwf(r.cost_per_poor_reached)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </FadeIn>
            <SourceNote kind="modelled">
              Each rule selects the same number of beneficiaries from the same synthetic sample;
              only the ordering differs. Poor reached: {data ? num(data.total_poor_in_sample) : "—"}{" "}
              poor households in sample. Ranges are 95% bootstrap intervals from{" "}
              {data?.bootstrap_reps ?? 200} resamples of those households — sampling variability
              only, not the EICV7 design.
            </SourceNote>

            {/* Geographic reach. Coverage alone can be bought by concentrating the caseload in a
                handful of districts, which is precisely what geographic targeting does; the ratio
                makes that trade-off visible instead of leaving it to a footnote. */}
            {data?.fairness ? (
              <div className="mt-8 border-t border-line pt-5">
                <h3 className="label">Geographic reach</h3>
                <p className="mt-1 max-w-[74ch] text-[13.5px] leading-snug text-ink-soft">
                  A rule can reach the poor and still put the caseload in five districts. The ratio
                  compares each rule&apos;s share of beneficiaries in the ten poorest districts
                  with those districts&apos; share of all poor households: 1.00 is proportional,
                  above 1 concentrates.
                </p>
                <div
                  role="region"
                  aria-label="Geographic reach by rule"
                  tabIndex={0}
                  className="mt-3 overflow-x-auto"
                >
                  <table className="w-full min-w-[360px] border-collapse text-[14.5px]">
                    <caption className="sr-only">
                      Districts reached and concentration of beneficiaries in the ten poorest
                      districts, by allocation rule.
                    </caption>
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="pb-2 pr-4 text-left font-medium text-ink-soft">
                          Rule
                        </th>
                        <th scope="col" className="pb-2 pr-4 text-right font-medium text-ink-soft">
                          Districts reached
                        </th>
                        <th scope="col" className="pb-2 pr-4 text-right font-medium text-ink-soft">
                          Share to 10 poorest
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium text-ink-soft">
                          vs proportional
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...data.results]
                        .sort((a, b) => b.coverage_of_poor - a.coverage_of_poor)
                        .map((r) => {
                          const f = data.fairness?.[r.id];
                          if (!f) return null;
                          return (
                            <tr key={r.id}>
                              <th scope="row" className="py-2 pr-4 text-left font-normal">
                                {r.label}
                              </th>
                              <td className="tnum py-2 pr-4 text-right">
                                {f.districts_reached} / 30
                              </td>
                              <td className="tnum py-2 pr-4 text-right">
                                {pct(f.share_to_poorest_decile, 1)}
                              </td>
                              <td className="tnum py-2 text-right font-medium">
                                {f.fairness_ratio === null ? "—" : f.fairness_ratio.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 max-w-[74ch] text-[13.5px] leading-snug text-ink-soft">
                  Proxy-means reaches the poor in {data.fairness.pmt?.districts_reached ?? "—"} of
                  30 districts, so it spreads the caseload the way a national programme needs to.
                  Geographic targeting concentrates all of it in five, which is cheaper to
                  administer but concentrates the political risk with it.
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
                Download this table (CSV)
              </Button>
              <span className="text-[13px] leading-snug text-ink-soft">
                Rules, coverage, leakage, cost and fairness at the parameters on screen. The file
                is stamped with the synthetic-data caveat.
              </span>
            </div>
          </section>

          {/* The model is the engine of the winning rule, so it belongs on this page rather
              than only in the method appendix. Every figure is read from /api/meta. */}
          <section className="mt-10" aria-label="Machine-learning model behind proxy-means">
            <div className="border-t border-line pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="label">The machine-learning model behind proxy-means</h3>
                <Tag tone="modelled">gradient boosting</Tag>
              </div>
              <p className="mt-3 max-w-[92ch] text-[15px] leading-relaxed text-ink-soft">
                Proxy-means is not a fixed formula. A gradient-boosted classifier scores every
                household on {meta?.model_card?.features?.length ?? 18} observable characteristics
                — assets, housing, education, income source and district — then ranks by predicted
                poverty risk. Consumption is excluded by design: it is the outcome the model is
                predicting, not something an enumerator could collect at enrolment.
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div className="border-l-2 border-primary pl-4">
                  <div className="label">Out-of-fold ROC-AUC</div>
                  <div className="tnum mt-1 text-[26px] font-semibold text-ink">
                    {meta?.model_card?.auc_gradient_boosting?.toFixed(3) ?? "—"}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink-soft">
                    Five-fold, scored on rows the model did not train on
                  </p>
                </div>
                <div className="border-l-2 border-line pl-4">
                  <div className="label">Training rows</div>
                  <div className="tnum mt-1 text-[26px] font-semibold text-ink">
                    {meta ? num(meta.model_card.n_train) : "—"}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink-soft">
                    Households in the calibrated layer, not a survey extract
                  </p>
                </div>
                <div className="border-l-2 border-line pl-4">
                  <div className="label">Features</div>
                  <div className="tnum mt-1 text-[26px] font-semibold text-ink">
                    {meta?.model_card?.features?.length ?? 18}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink-soft">
                    Consumption deliberately excluded
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13.5px] leading-snug text-ink-soft">
                Top signals:{" "}
                <span className="text-ink">
                  {meta?.model_card?.importance
                    ?.slice(0, 3)
                    .map((i) => i.feature)
                    .join(", ") ?? "—"}
                </span>
                .{" "}
                <a
                  className="font-medium text-primary-deep underline underline-offset-2"
                  href="/methodology#model"
                >
                  Full model card, calibration and sensitivity sweep
                </a>
                .
              </p>
            </div>
          </section>

          {/* Comparison panels. Both are column charts laid out in a two-column row on
              desktop and stacked on narrow screens. The bar list deliberately omits the
              right-hand note: in a half-width column it reserved more margin than the plot
              had, which is what left the bars invisible. */}
          <section className="mt-10 grid gap-10 lg:grid-cols-2">
            <div className="border-t border-line pt-5">
              <h3 className="label">Poor reached by rule</h3>
              <p className="mb-4 mt-1 text-[13.5px] leading-snug text-ink-soft">
                Share of all poor households reached at this budget.
              </p>
              {data ? (
                <BarList
                  items={[...data.results]
                    .sort((a, b) => b.coverage_of_poor - a.coverage_of_poor)
                    .map((r) => ({ label: r.label, value: r.coverage_of_poor }))}
                  format={(v) => pct(v, 1)}
                  max={maxCoverage <= 10 ? 10 : Math.ceil((maxCoverage * 1.05) / 10) * 10}
                  highlight={pmt?.label}
                  highlightColor="teal"
                  valueLabels
                />
              ) : (
                <div className="h-52" />
              )}
            </div>

            <div className="border-t border-line pt-5">
              <h3 className="label">Coverage vs caseload</h3>
              <p className="mb-4 mt-1 text-[13.5px] leading-snug text-ink-soft">
                Share of poor households reached, by share of households enrolled.
              </p>
              {data ? (
                <div
                  role="img"
                  aria-label="Grouped column chart: the share of poor households reached by each of the five allocation rules at enrolment levels from 5 to 50 percent. Proxy-means is highest at every level; universal allocation is lowest."
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={data.coverage_curve}
                      margin={{ top: 8, right: 8, left: 0, bottom: 26 }}
                      barGap={2}
                      barCategoryGap="18%"
                    >
                      <CartesianGrid stroke="#dfe4ea" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="caseload_pct"
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 12.5, fill: "#37404d" }}
                        tickLine={false}
                        axisLine={{ stroke: "#dfe4ea" }}
                        label={{
                          value: "Households enrolled (% of sample)",
                          position: "insideBottom",
                          offset: -16,
                          fontSize: 12.5,
                          fill: "#37404d",
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 12.5, fill: "#37404d" }}
                        tickLine={false}
                        axisLine={{ stroke: "#dfe4ea" }}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                        labelFormatter={(v) => `${v}% of households enrolled`}
                        contentStyle={{
                          background: "#ffffff",
                          border: "1px solid #dfe4ea",
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                      />
                      {series.map((s) => (
                        <Bar
                          key={s.id}
                          dataKey={s.id}
                          name={s.label}
                          fill={s.color}
                          fillOpacity={0.85}
                          maxBarSize={14}
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-soft">
                    {series.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-[2px]"
                          style={{ background: s.color }}
                        />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-52" />
              )}
            </div>
          </section>

          {/* The argument */}
          {pmt && universal && ratio ? (
            <section className="mt-10">
              <PullQuote label="The argument">
                On {bound(budget)}, universal allocation reaches{" "}
                <strong className="font-semibold">{num(universal.poor_reached)}</strong> poor
                households and leaks{" "}
                <strong className="font-semibold">{pct(universal.leakage_rate, 1)}</strong> of the
                budget to non-poor households. The proxy-means rule reaches{" "}
                <strong className="font-semibold">{num(pmt.poor_reached)}</strong> —{" "}
                <strong className="font-semibold">
                  {ratio.toFixed(1)}× more poor people for the same money
                </strong>{" "}
                — and cuts leakage to{" "}
                <strong className="font-semibold">{pct(pmt.leakage_rate, 1)}</strong>. Geographic
                targeting captures most of the gain at a fraction of the data cost, which matters
                where a full household survey is not available.
              </PullQuote>
            </section>
          ) : null}

          {data ? (
            <p className="mt-8 max-w-[70ch] text-[14px] leading-relaxed text-ink-soft">
              Household rows are calibrated synthetic microdata ({num(data.sample_households)} rows)
              reproducing published EICV7 marginals. Rankings are illustrative until the EICV7
              microdata file is loaded — the engine does not change, only the rows it reads.
            </p>
          ) : !error ? (
            <div className="mt-8" aria-hidden>
              <Skeleton className="h-[14px] w-full max-w-[70ch]" />
              <Skeleton className="mt-2 h-[14px] w-2/3 max-w-[70ch]" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * First-paint placeholder for the results column. It mirrors the loaded page's bands — the
 * four-cell ledger, the ranked table, the two comparison panels — so the layout settles while
 * the allocation runs. Visual blocks are hidden from assistive tech; the live region carries
 * the one sentence a screen reader needs.
 */
function TargetingSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Computing allocation for this budget…</span>
      <div aria-hidden>
        <section aria-label="Headline results">
          <Ledger>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </Ledger>
        </section>

        <section className="mt-9">
          <Skeleton className="h-[26px] w-80 max-w-full" />
          <Skeleton className="mt-2 h-[17px] w-full max-w-[62ch]" />
          <Skeleton className="mt-1.5 h-[17px] w-3/4 max-w-[62ch]" />

          {/* Phones: five stacked rule cards, same as the loaded list. */}
          <div className="mt-5 space-y-3 md:hidden">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface p-4">
                <Skeleton className="h-[16px] w-40 max-w-full" />
                <Skeleton className="mt-2 h-[13px] w-full" />
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Skeleton className="h-[13px] w-24 max-w-full" />
                  <Skeleton className="h-[13px] w-24 max-w-full" />
                  <Skeleton className="h-[13px] w-20 max-w-full" />
                  <Skeleton className="h-[13px] w-28 max-w-full" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: real header, shimmering rows, so the columns keep their widths. */}
          <div className="mt-5 hidden md:block">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-8">
                    #
                  </TableHead>
                  <TableHead scope="col">Rule</TableHead>
                  <TableHead scope="col" className="text-right">
                    Accuracy
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Coverage
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Leakage
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Cost / poor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonTableRows rows={5} cols={6} />
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="mt-10 grid gap-10 lg:grid-cols-2">
          <div className="border-t border-line pt-5">
            <Skeleton className="h-[12px] w-32" />
            <Skeleton className="mt-2 h-[13px] w-60 max-w-full" />
            <div className="mt-4">
              <SkeletonBars rows={5} />
            </div>
          </div>
          <div className="border-t border-line pt-5">
            <Skeleton className="h-[12px] w-36" />
            <Skeleton className="mt-2 h-[13px] w-64 max-w-full" />
            <Skeleton className="mt-4 h-[300px] w-full rounded-lg" />
          </div>
        </section>
      </div>
    </div>
  );
}
