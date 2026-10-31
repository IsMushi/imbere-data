"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarList } from "@/components/BarList";
import { EASE } from "@/components/Motion";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  apiGet,
  apiPost,
  type District,
  type Meta,
  type SimulationResponse,
} from "@/lib/api";
import { compact, num, pct, rwf, rwfValue } from "@/lib/format";

const SHOCK_ORDER = ["drought", "flood", "storm", "pest", "health", "food_price", "income_loss"];

export default function SimulatorPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState<string>("");
  const [shock, setShock] = useState<string>("drought");
  const [severity, setSeverity] = useState<number>(50);
  const [extras, setExtras] = useState<{ shock_type: string; severity: number }[]>([]);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    Promise.all([apiGet<Meta>("/api/meta", "/api/meta.json"), apiGet<{ districts: District[] }>("/api/districts", "/api/districts.json")])
      .then(([m, d]) => {
        setMeta(m);
        setDistricts(d.districts);
        const fromUrl = new URLSearchParams(window.location.search).get("district");
        const initial =
          fromUrl && d.districts.some((x) => x.district === fromUrl)
            ? fromUrl
            : (d.districts[0]?.district ?? "");
        setDistrict(initial);
      })
      .catch((e: Error) => setError(e.message));
  }, [attempt]);

  const run = useCallback(
    async (d: string, s: string, sev: number, extra: { shock_type: string; severity: number }[]) => {
      if (!d) return;
      const id = ++reqId.current;
      setLoading(true);
      try {
        const r = await apiPost<SimulationResponse>("/api/simulate", {
          district: d,
          shock_type: s,
          severity: sev,
          additional_shocks: extra,
        });
        if (id === reqId.current) {
          setResult(r);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!district) return;
    const t = setTimeout(() => void run(district, shock, severity, extras), 120);
    return () => clearTimeout(t);
  }, [district, shock, severity, extras, run, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const sorted = useMemo(
    () => [...districts].sort((a, b) => b.poverty_2024 - a.poverty_2024),
    [districts],
  );

  const shockOptions = useMemo(
    () =>
      SHOCK_ORDER.filter((k) => meta?.shock_assumptions?.[k]).map((k) => ({
        id: k,
        label: meta!.shock_assumptions[k].label,
      })),
    [meta],
  );

  // Compound scenarios. Two extra shocks is enough to show that impacts add: the rail stays
  // scannable, and the API accepts up to six for scripted use.
  const addExtra = useCallback(() => {
    setExtras((list) => {
      if (list.length >= 2) return list;
      const used = new Set([shock, ...list.map((e) => e.shock_type)]);
      const next = SHOCK_ORDER.find((id) => !used.has(id)) ?? "flood";
      return [...list, { shock_type: next, severity: 50 }];
    });
  }, [shock]);

  const updateExtra = useCallback(
    (index: number, patch: Partial<{ shock_type: string; severity: number }>) => {
      setExtras((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)));
    },
    [],
  );

  const r = result?.result;

  // Metadata and the district list arrive together; until they do the controls have no
  // options and the outcome has nothing to show, so both sides shimmer in place.
  const pending = !error && !meta;

  return (
    <div className="shell pt-10">
      <div className="max-w-[68ch]">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="modelled">Shock parameters are assumptions</Tag>
        </div>
        <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[48px]">
          What does a bad season cost?
        </h1>
        <p className="mt-4 text-[19.5px] leading-[1.65] text-ink-soft">
          Choose a district and a shock. IMBERE applies the shock to the household distribution,
          lets resilience absorb part of the loss, and counts how many households cross the poverty
          line — and what a cash response would cost.
        </p>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Scenario rail */}
        <div className="h-fit lg:sticky lg:top-16">
          <h2 className="label">Scenario</h2>

          <div className="mt-3 border-t border-line pt-4">
            <Label htmlFor={pending ? undefined : "district"}>District</Label>
            {pending ? (
              <Skeleton className="mt-1.5 h-9 w-full rounded-sm" />
            ) : (
              <Select value={district} onValueChange={setDistrict}>
                <SelectTrigger id="district" className="mt-1.5" aria-label="District">
                  <SelectValue placeholder="Choose a district" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((d) => (
                    <SelectItem key={d.district} value={d.district}>
                      {d.district} — {d.poverty_2024}% poor
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <fieldset className="mt-5" aria-busy={pending || undefined}>
            <legend className="text-[15px] font-medium text-ink">Shock type</legend>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5">
              {pending
                ? SHOCK_ORDER.map((id) => (
                    <Skeleton key={id} className="h-9 w-full rounded-sm" />
                  ))
                : shockOptions.map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      variant={shock === s.id ? "secondary" : "outline"}
                      onClick={() => setShock(s.id)}
                      aria-pressed={shock === s.id}
                      className="h-auto w-full justify-start px-3 py-2 text-left font-normal aria-pressed:border-primary aria-pressed:font-medium"
                    >
                      {s.label}
                    </Button>
                  ))}
            </div>
          </fieldset>

          <div className="mt-5 flex items-baseline justify-between">
            <Label>Severity</Label>
            <span className="tnum text-[16px] font-semibold">{severity}</span>
          </div>
          <Slider
            className="mt-2.5"
            value={[severity]}
            onValueChange={([v]) => setSeverity(v)}
            min={0}
            max={100}
            step={5}
            thumbLabel="Severity"
            valueText={`${severity} of 100`}
          />
          <div className="mt-1 flex justify-between text-[12.5px] text-ink-soft">
            <span>Mild</span>
            <span>Severe</span>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="label">Compound scenario</h3>
              {extras.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setExtras([])}
                  className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">
              Shocks that land in the same season. Exposure combines as 1 − ∏(1 − p) and losses
              add before resilience absorbs them.
            </p>

            <div className="mt-3 space-y-3">
              {extras.map((e, i) => (
                <div key={i} className="rounded-sm border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">Shock {i + 2}</span>
                    <button
                      type="button"
                      onClick={() => setExtras((list) => list.filter((_, j) => j !== i))}
                      className="text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <Select
                    value={e.shock_type}
                    onValueChange={(v) => updateExtra(i, { shock_type: v })}
                  >
                    <SelectTrigger className="mt-2" aria-label={`Shock ${i + 2} type`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {shockOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 flex items-baseline justify-between text-[12.5px] text-ink-soft">
                    <Label htmlFor={`extra-severity-${i}`}>Severity</Label>
                    <span className="tnum font-medium text-ink">{e.severity}</span>
                  </div>
                  <Slider
                    id={`extra-severity-${i}`}
                    className="mt-1.5"
                    value={[e.severity]}
                    onValueChange={([v]) => updateExtra(i, { severity: v })}
                    min={0}
                    max={100}
                    step={5}
                    thumbLabel={`Shock ${i + 2} severity`}
                    valueText={`${e.severity} of 100`}
                  />
                </div>
              ))}
            </div>

            {extras.length < 2 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={addExtra}
                disabled={pending}
              >
                + Add simultaneous shock
              </Button>
            ) : null}
          </div>

          {pending ? (
            <div className="mt-4 border-t border-line pt-3" aria-hidden>
              <Skeleton className="h-[14px] w-full" />
              <Skeleton className="mt-2 h-[14px] w-2/3" />
            </div>
          ) : (
            <p className="mt-4 border-t border-line pt-3 text-[14px] leading-relaxed text-ink-soft">
              {meta?.severity_note ??
                "Severity scales exposure and loss together. 50 is the baseline assumption."}
            </p>
          )}
        </div>

        {/* Outcome */}
        <div>
          {error ? (
            <PanelState kind="error" onRetry={retry}>
              Could not run the simulation
            </PanelState>
          ) : null}

          {!result && !error ? <OutcomeSkeleton /> : null}

          {r && result ? (
            <>
              {/* Before → after strip */}
              <motion.section
                aria-label="Outcome of the selected scenario"
                aria-busy={loading}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: loading ? 0.6 : 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <Ledger>
                  <Kpi
                    label="Households exposed"
                    value={compact(r.exposed_households)}
                    note={`of ${compact(result.district_households)} in ${result.district}`}
                  />
                  <Kpi
                    label="Pushed below the line"
                    value={compact(r.newly_poor_households)}
                    note={`≈ ${compact(r.newly_poor_people)} people`}
                    tone="accent"
                  />
                  <Kpi
                    label="Poverty rate after the shock"
                    value={pct(r.poverty_rate_after)}
                    note={`from ${pct(r.poverty_rate_before)} before · +${(r.poverty_rate_after - r.poverty_rate_before).toFixed(1)} pts`}
                    tone="primary"
                  />
                  <Kpi
                    label="Cash to restore the line (RWF)"
                    value={rwfValue(r.cash_need_rwf)}
                    note={`${rwf(r.cash_need_per_household_rwf)} per affected household`}
                  />
                </Ledger>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[14.5px] text-ink-soft">
                  <span>
                    Households below the line after the shock:{" "}
                    <strong className="tnum font-medium text-ink">
                      {num(r.households_below_line_after)}
                    </strong>
                  </span>
                  <span>
                    Mean consumption loss:{" "}
                    <strong className="tnum font-medium text-ink">
                      {pct(r.mean_consumption_loss_pct)}
                    </strong>
                  </span>
                  <span>
                    Newly extreme poor:{" "}
                    <strong className="tnum font-medium text-ink">
                      {num(r.newly_extreme_poor_households)}
                    </strong>{" "}
                    households
                  </span>
                </div>

                <SourceNote kind="assumed">
                  Exposure and loss parameters are stated assumptions, not EICV7 estimates.
                </SourceNote>

                {result.combined ? (
                  <div className="mt-6 border-t border-line pt-4">
                    <h3 className="label">What each shock contributes</h3>
                    <p className="mt-1 max-w-[72ch] text-[13.5px] leading-snug text-ink-soft">
                      Each row is that shock run on its own at the severity shown. The rows add up
                      to more than the combined figure because a household already pushed below
                      the line by one shock cannot cross it a second time.
                    </p>
                    <div
                      role="region"
                      aria-label="Per-shock contribution to the compound scenario"
                      tabIndex={0}
                      className="mt-3 overflow-x-auto"
                    >
                      <table className="w-full min-w-[400px] border-collapse text-[14.5px]">
                        <caption className="sr-only">
                          Newly poor households and cash needed for each shock in the compound
                          scenario, measured on its own.
                        </caption>
                        <thead>
                          <tr className="border-b border-line">
                            <th scope="col" className="pb-2 pr-4 text-left font-medium text-ink-soft">
                              Shock
                            </th>
                            <th scope="col" className="pb-2 pr-4 text-right font-medium text-ink-soft">
                              Severity
                            </th>
                            <th scope="col" className="pb-2 pr-4 text-right font-medium text-ink-soft">
                              Newly poor alone
                            </th>
                            <th scope="col" className="pb-2 text-right font-medium text-ink-soft">
                              Cash need alone
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {result.components.map((c) => (
                            <tr key={c.id}>
                              <th scope="row" className="py-2 pr-4 text-left font-normal">
                                {c.label}
                              </th>
                              <td className="tnum py-2 pr-4 text-right">{c.severity}</td>
                              <td className="tnum py-2 pr-4 text-right">
                                {num(c.newly_poor_households)}
                              </td>
                              <td className="tnum py-2 text-right">{rwf(c.cash_need_rwf)}</td>
                            </tr>
                          ))}
                          <tr className="font-medium">
                            <th scope="row" className="py-2 pr-4 text-left">
                              Combined
                            </th>
                            <td className="tnum py-2 pr-4 text-right">—</td>
                            <td className="tnum py-2 pr-4 text-right">
                              {num(r.newly_poor_households)}
                            </td>
                            <td className="tnum py-2 text-right">{rwf(r.cash_need_rwf)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </motion.section>

              {/* Same severity, other shocks */}
              <section className="mt-10 border-t border-line pt-6">
                <SectionHeading title="Same severity, different shock">
                  A drought and a food-price spike hit the same district very differently. This is
                  the ranking for {result.district} at severity {severity}.
                </SectionHeading>
                {result ? (
                  <BarList
                    items={result.compare.map((c) => ({
                      label: c.label,
                      value: c.newly_poor_households,
                      note: `${rwf(c.cash_need_rwf)} to restore`,
                    }))}
                    format={(v) => compact(v)}
                    max={Math.max(...result.compare.map((c) => c.newly_poor_households)) * 1.05}
                    highlight={result.shock_label}
                    color="primary"
                  />
                ) : (
                  <div className="h-40" />
                )}
              </section>

              {/* Assumptions */}
              <section className="mt-10 border-t border-line pt-6">
                <div className="mb-3 flex flex-wrap items-baseline gap-2">
                  <h3 className="text-[16px] font-semibold text-ink">Assumption table</h3>
                  <span className="text-[14.5px] text-ink-soft">
                    exposure = share of households hit · loss = consumption lost at severity 100
                  </span>
                </div>
                <Table className="min-w-[340px]">
                  <TableCaption>
                    Exposure and consumption loss assumed for each shock type.
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Shock</TableHead>
                      <TableHead scope="col" className="text-right">
                        Exposure
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Loss
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(result?.assumptions ?? meta?.shock_assumptions ?? {}).map(
                      ([id, a]) => (
                        <TableRow key={id}>
                          <th scope="row" className="py-1.5 text-left font-normal">
                            {a.label}
                          </th>
                          <TableCell className="tnum text-right">
                            {pct(a.exposure * 100, 0)}
                          </TableCell>
                          <TableCell className="tnum text-right">{pct(a.loss * 100, 0)}</TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
                <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-soft">
                  Resilience absorbs part of the loss: households with savings, mobile money and
                  insurance keep more of their consumption. The base exposures are scaled so that
                  the seven shocks together imply{" "}
                  <strong className="font-semibold text-ink">
                    {pct(result?.implied_shock_incidence ?? 37.1, 1)}
                  </strong>{" "}
                  of households hit by at least one severe shock — the published EICV7 incidence
                  (Tables 6.10–6.11). The split between shocks and the loss rates are{" "}
                  <strong className="font-semibold text-ink">not</strong> estimated from EICV7 and
                  should be calibrated once microdata access is granted.
                </p>
              </section>

              {/* Reading */}
              <section className="mt-10">
                <PullQuote label="Reading this">
                  {result.combined ? (
                    <>
                      A compound scenario —{" "}
                      {result.shocks
                        .map((s) => `${s.label.toLowerCase()} at ${s.severity}`)
                        .join(", plus ")}
                      {" "}— in {result.district} exposes about{" "}
                    </>
                  ) : (
                    <>
                      A {result.shock_label.toLowerCase()} at severity {severity} in{" "}
                      {result.district} exposes about{" "}
                    </>
                  )}
                  <strong className="font-semibold">{compact(r.exposed_households)}</strong>{" "}
                  households. Roughly{" "}
                  <strong className="font-semibold">{compact(r.newly_poor_households)}</strong> fall
                  below the poverty line, lifting the district rate from{" "}
                  <strong className="font-semibold">{pct(r.poverty_rate_before)}</strong> to{" "}
                  <strong className="font-semibold">{pct(r.poverty_rate_after)}</strong>. Restoring
                  every affected household to the line would cost about{" "}
                  <strong className="font-semibold">{rwf(r.cash_need_rwf)}</strong> — the number a
                  shock-responsive budget line has to hold in reserve.
                </PullQuote>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * First-paint placeholder for the outcome column. It mirrors the result's own bands — the
 * four-cell ledger, the fact line, the comparison bars, the assumption table and the pull
 * quote — so nothing jumps when the simulation answers. The visual blocks are hidden from
 * assistive tech; the live region carries the one sentence a screen reader needs.
 */
function OutcomeSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Running the scenario…</span>
      <div aria-hidden>
        <Ledger>
          <SkeletonKpi />
          <SkeletonKpi />
          <SkeletonKpi />
          <SkeletonKpi />
        </Ledger>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Skeleton className="h-[14px] w-64" />
          <Skeleton className="h-[14px] w-48" />
          <Skeleton className="h-[14px] w-52" />
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <Skeleton className="h-[13px] w-full max-w-[420px]" />
        </div>

        <section className="mt-10 border-t border-line pt-6">
          <Skeleton className="h-[26px] w-64 max-w-full" />
          <Skeleton className="mt-2 h-[14px] w-full max-w-[58ch]" />
          <div className="mt-5">
            <SkeletonBars rows={7} note />
          </div>
        </section>

        <section className="mt-10 border-t border-line pt-6">
          <Skeleton className="h-[16px] w-44" />
          <Skeleton className="mt-2 h-[14px] w-full max-w-[52ch]" />
          <Table className="mt-3 min-w-[340px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Shock</TableHead>
                <TableHead scope="col" className="text-right">
                  Exposure
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Loss
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonTableRows rows={7} cols={3} />
            </TableBody>
          </Table>
          <Skeleton className="mt-3 h-[14px] w-full max-w-[70ch]" />
          <Skeleton className="mt-2 h-[14px] w-3/4 max-w-[70ch]" />
        </section>

        <section className="mt-10 border-l-2 border-primary pl-5">
          <Skeleton className="h-[12px] w-24" />
          <Skeleton className="mt-2.5 h-[20px] w-full" />
          <Skeleton className="mt-2 h-[20px] w-11/12" />
          <Skeleton className="mt-2 h-[20px] w-3/4" />
        </section>
      </div>
    </div>
  );
}
