"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EASE } from "@/components/Motion";
import { BarList } from "@/components/BarList";
import {
  Kpi,
  Ledger,
  PanelState,
  SectionHeading,
  SkeletonKpi,
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
  ApiTimeoutError,
  type District,
  type Meta,
  type ProtectionResponse,
} from "@/lib/api";
import { compact, num, pct, rwf, rwfValue } from "@/lib/format";
import { useSlowNotice } from "@/lib/useSlowNotice";

const SHOCK_ORDER = ["drought", "flood", "storm", "pest", "health", "food_price", "income_loss"];

export default function ProtectionPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState<string>("");
  const [shock, setShock] = useState<string>("drought");
  const [severity, setSeverity] = useState<number>(50);
  const [result, setResult] = useState<ProtectionResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    Promise.all([
      apiGet<Meta>("/api/meta", "/api/meta.json"),
      apiGet<{ districts: District[] }>("/api/districts", "/api/districts.json"),
    ])
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
      .catch((e: Error) => setError(e));
  }, [attempt]);

  const run = useCallback(async (d: string, s: string, sev: number) => {
    if (!d) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const r = await apiPost<ProtectionResponse>("/api/protection", {
        district: d,
        shock_type: s,
        severity: sev,
      });
      if (id === reqId.current) {
        setResult(r);
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError(e as Error);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!district) return;
    const t = setTimeout(() => void run(district, shock, severity), 120);
    return () => clearTimeout(t);
  }, [district, shock, severity, run, attempt]);

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

  const pending = !error && !meta;
  const waking = useSlowNotice(loading && !result);

  const measured = result?.measured;
  const incidence = measured?.shock_incidence;
  const coping = measured?.coping_responses ?? [];
  const help = coping.find((c) => c.id === "received_help");
  const vup = measured?.vup;
  const ctx = result?.district_context;

  return (
    <div className="shell pt-10">
      <div className="max-w-[68ch]">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="real">Shock and coping figures are published</Tag>
          <Tag tone="modelled">The transfer scenario is modelled</Tag>
        </div>
        <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[48px]">
          Does help reach the people a shock pushes down?
        </h1>
        <p className="mt-4 text-[19.5px] leading-[1.65] text-ink-soft">
          EICV7 asks households what they did when a severe shock hit. Almost four in ten reported
          one; fewer than one in ten reported receiving help. The second half of this page prices a
          VUP-style transfer against the households that a shock would push below the line.
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
                      {d.district} · {d.poverty_2024}% poor
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
                ? SHOCK_ORDER.map((id) => <Skeleton key={id} className="h-9 w-full rounded-sm" />)
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
            <PanelState
              kind="error"
              onRetry={retry}
              detail={
                error instanceof ApiTimeoutError
                  ? "The engine sleeps when idle and is still waking up. Retry, or change the scenario again in a few seconds."
                  : "Make sure the API server is running and accessible."
              }
            >
              Could not run the scenario
            </PanelState>
          ) : null}

          {!result && !error ? (
            <div>
              <Ledger>
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonKpi key={i} />
                ))}
              </Ledger>
              <p className="mt-3 text-[14px] text-ink-soft">
                {waking ? "Waking the engine, this can take up to a minute." : "Loading…"}
              </p>
            </div>
          ) : null}

          {result ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: loading ? 0.6 : 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              aria-busy={loading}
            >
              <section aria-label="Who VUP reaches">
                <SectionHeading module="01" title="Who VUP reaches">
                  Vision 2020 Umurenge Programme, 2023/24. Coverage and adequacy are published
                  national figures, not estimates.
                </SectionHeading>

                <Ledger>
                  <Kpi
                    label="VUP beneficiaries"
                    value={vup ? num(vup.beneficiaries.total) : "—"}
                    note="2023/24, all five programmes"
                    tone="primary"
                  />
                  <Kpi
                    label="Beneficiaries below the line"
                    value={vup ? pct(vup.poverty.beneficiaries_pct) : "—"}
                    note={vup ? `against ${pct(vup.poverty.national_pct)} nationally` : undefined}
                    tone="accent"
                  />
                  <Kpi
                    label="Beneficiaries who are women"
                    value={vup ? pct(vup.beneficiaries.female_share_pct) : "—"}
                    note="52.1% of the population"
                  />
                  <Kpi
                    label="Direct Support paid on time"
                    value={vup ? pct(vup.timeliness.ds_on_time_pct) : "—"}
                    note="last payment, 56.2% a week or more late"
                  />
                </Ledger>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="label">Beneficiaries by programme</h3>
                    <div className="mt-3">
                      <BarList
                        items={(vup?.components ?? []).map((c) => ({
                          label: c.label,
                          value: c.share_pct,
                        }))}
                        format={(v) => pct(v)}
                        max={30}
                        valueLabels
                      />
                    </div>
                  </div>
                  <div>
                    <h3 className="label">Poverty rate by programme</h3>
                    <div className="mt-3">
                      <BarList
                        items={(vup?.poverty_by_component ?? []).map((c) => ({
                          label: c.label,
                          value: c.poverty_pct,
                        }))}
                        format={(v) => pct(v)}
                        max={50}
                        highlight="Classic Public Works"
                        valueLabels
                      />
                    </div>
                  </div>
                </div>

                <SourceNote
                  kind="measured"
                  shows="How many people VUP reaches, how poor they are relative to the country, and which programme carries the most beneficiaries."
                  trust="Point estimates from the 2023/24 survey, published as they stand. The programme shares add to 104.7 because a household can hold more than one instrument, so the bars are not parts of a whole. Coverage is national: NISR does not publish beneficiaries by district, so this panel cannot be cut geographically."
                >
                  EICV7 Main Indicators Report, Tables 10.1, 10.2 and 10.4.
                </SourceNote>
              </section>

              <section className="mt-10" aria-label="What households reported doing after a severe shock">
                <SectionHeading module="02" title="What households reported">
                  Rwanda, EICV7 2023/24. Shares are of households that reported a severe shock.
                </SectionHeading>

                <Ledger>
                  <Kpi
                    label="Hit by a severe shock"
                    value={incidence ? pct(incidence.all) : "—"}
                    note={incidence ? `${pct(incidence.poor)} of poor households` : undefined}
                    tone="accent"
                  />
                  <Kpi
                    label="Coped by receiving help"
                    value={help ? pct(help.all) : "—"}
                    note={help ? `${pct(help.poor)} of poor households` : undefined}
                    tone="primary"
                  />
                  <Kpi
                    label="Bought less food"
                    value={
                      coping.find((c) => c.id === "less_food")
                        ? pct(coping.find((c) => c.id === "less_food")!.all)
                        : "—"
                    }
                    note="the most common response among the poor"
                  />
                  <Kpi
                    label="Used savings or borrowed"
                    value={
                      coping.find((c) => c.id === "savings_borrowing")
                        ? pct(coping.find((c) => c.id === "savings_borrowing")!.all)
                        : "—"
                    }
                    note="more common among non-poor households"
                  />
                </Ledger>

                <div className="mt-6 overflow-hidden rounded-xl border border-line">
                  <Table>
                    <TableCaption className="sr-only">
                      Main coping response after a severe shock, by poverty status
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-5 py-3">Main response</TableHead>
                        <TableHead className="px-5 py-3 text-right">All</TableHead>
                        <TableHead className="px-5 py-3 text-right">Poor</TableHead>
                        <TableHead className="px-5 py-3 text-right">Non-poor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coping.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="px-5 py-3.5">{c.label}</TableCell>
                          <TableCell className="tnum px-5 py-3.5 text-right">{pct(c.all)}</TableCell>
                          <TableCell className="tnum px-5 py-3.5 text-right">{pct(c.poor)}</TableCell>
                          <TableCell className="tnum px-5 py-3.5 text-right">{pct(c.non_poor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <SourceNote
                  kind="measured"
                  shows="What households said they did when a severe shock hit, and whether the poor and the non-poor cope differently."
                  trust="Shares of households reporting a severe shock, as published. Coping is a single main response, so the rows overlap with shock types rather than summing to a story."
                >
                  EICV7 Tables 6.10 and 6.11, via the API. VUP has seven instruments and none of them
                  is separately observed in this table.
                </SourceNote>
              </section>

              <section className="mt-10" aria-label="What the shock does in this district">
                <SectionHeading module="03" title="What this shock does here">
                  {result.shock_label} at severity {result.severity} in {result.district}.
                </SectionHeading>

                <Ledger>
                  <Kpi
                    label="Households exposed"
                    value={ctx ? compact(ctx.exposed_households) : "—"}
                    note={ctx ? `of ${compact(ctx.households)} in ${result.district}` : undefined}
                  />
                  <Kpi
                    label="Pushed below the line"
                    value={ctx ? compact(ctx.newly_poor_households) : "—"}
                    note={ctx ? `poverty ${pct(ctx.poverty_rate)} before the shock` : undefined}
                    tone="accent"
                  />
                  <Kpi
                    label="Cash to restore the line"
                    value={ctx ? rwfValue(ctx.cash_need_rwf) : "—"}
                    note={ctx ? `${rwf(ctx.mean_deficit_rwf)} mean deficit` : undefined}
                  />
                  <Kpi
                    label="Households in the district"
                    value={ctx ? compact(ctx.households) : "—"}
                    note={result.province}
                  />
                </Ledger>

                <SourceNote
                  kind="modelled"
                  shows="How many households this shock exposes, how many it pushes below the poverty line, and what restoring every affected household to the line would cost."
                  trust="The households are a calibrated synthetic layer, not EICV7 microdata, and the exposure and loss parameters are stated assumptions. Treat the level as illustrative and the ranking of shocks as the robust part."
                >
                  Exposure and loss parameters are the same assumptions the simulator uses.
                </SourceNote>
              </section>

              <section className="mt-10" aria-label="What a transfer protects">
                <SectionHeading module="04" title="What a transfer of this size protects">
                  Every household pushed below the line is assumed to receive the transfer. The
                  question is adequacy, not selection; targeting is priced on its own page.
                </SectionHeading>

                <div className="overflow-hidden rounded-xl border border-line">
                  <Table>
                    <TableCaption className="sr-only">
                      Share of shock-pushed households kept above the poverty line at each
                      transfer level
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-5 py-3">Transfer per household</TableHead>
                        <TableHead className="px-5 py-3 text-right">Protected</TableHead>
                        <TableHead className="px-5 py-3 text-right">Households</TableHead>
                        <TableHead className="px-5 py-3 text-right">Cost per year</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.ladder.map((row) => (
                        <TableRow key={row.transfer_rwf}>
                          <TableCell className="px-5 py-3.5">{rwf(row.transfer_rwf)}</TableCell>
                          <TableCell className="tnum px-5 py-3.5 text-right font-medium">
                            {pct(row.share_protected_pct)}
                          </TableCell>
                          <TableCell className="tnum px-5 py-3.5 text-right">
                            {num(row.households_protected)}
                          </TableCell>
                          <TableCell className="tnum px-5 py-3.5 text-right">
                            {rwfValue(row.cost_rwf)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <SourceNote
                  kind="assumed"
                  shows="How far each transfer level goes: the share of shock-pushed households that end the year above the poverty line, how many that is, and what it costs."
                  trust="The transfer levels are stated assumptions, not published VUP benefit amounts, and every newly poor household is assumed to receive the transfer. This prices adequacy, not selection."
                >
                  Protection means post-shock consumption plus the transfer divided by household size
                  reaches the poverty line.
                </SourceNote>
              </section>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
