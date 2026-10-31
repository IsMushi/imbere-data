"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarList } from "@/components/BarList";
import { DistrictRail, DistrictRailSkeleton } from "@/components/DistrictRail";
import { DonutChart } from "@/components/DonutChart";
import { EASE, inView, MotionBar, Stagger, StaggerItem } from "@/components/Motion";
import { Findings } from "@/components/Findings";
import { binColor, RwandaMap } from "@/components/RwandaMap";
import { RwandaWatermark } from "@/components/RwandaWatermark";
import {
  Kpi,
  Ledger,
  PanelState,
  SectionHeading,
  SkeletonBars,
  SkeletonKpi,
  SourceNote,
  Tag,
} from "@/components/Ui";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, type District, type Meta } from "@/lib/api";
import { compact, num, pct, signed } from "@/lib/format";

// Chart colours cannot use Tailwind classes; kept in step with the tokens in globals.css.
const HEALTH = [
  { key: "healthy", label: "Healthy", color: "#004077" },
  { key: "coping", label: "Coping", color: "#196cb3" },
  { key: "vulnerable", label: "Vulnerable", color: "#008482" },
  { key: "extremely_vulnerable", label: "Extremely vulnerable", color: "#c95100" },
] as const;

/**
 * Who acts on the figures, and on what. Three roles rather than three benefits: a reader
 * should be able to tell within one screen whether this tool is aimed at them, and a
 * judge should be able to tell who would deploy it.
 */
const USERS = [
  {
    who: "LODA",
    role: "Sets the VUP caseload",
    does: "Compare five targeting rules on the same budget before the next fiscal year, not after it.",
  },
  {
    who: "MINALOC",
    role: "Reviews social-protection eligibility",
    does: "See what a rule leaks to the non-poor, and how much exclusion that leakage buys.",
  },
  {
    who: "District officers",
    role: "Size a shock reserve",
    does: "Cost what a drought or a flood does to the poverty rate in their own district.",
  },
] as const;

export default function OverviewPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // Legend band the map is isolated to, or null for every district.
  const [focusBin, setFocusBin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(null);
    Promise.all([apiGet<Meta>("/api/meta"), apiGet<{ districts: District[] }>("/api/districts")])
      .then(([m, d]) => {
        setMeta(m);
        setDistricts(d.districts);
        setSelected((prev) =>
          prev && d.districts.some((x) => x.district === prev)
            ? prev
            : (d.districts[0]?.district ?? null),
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Skeletons, not a page of em dashes: both requests resolve together, so one flag covers it.
  // `pending` tracks the request, not the result — an empty districts array is a resolved
  // answer and must render an empty state rather than a skeleton that never clears.
  const pending = !error && !meta;
  const empty = !pending && !error && districts.length === 0;

  const stalled = useMemo(() => districts.filter((d) => d.stalled_progress).length, [districts]);
  const sel = useMemo(
    () => districts.find((d) => d.district === selected) ?? null,
    [districts, selected],
  );

  const provinceItems = useMemo(
    () =>
      (meta?.province_poverty ?? [])
        .slice()
        .sort((a, b) => b.poverty_2024 - a.poverty_2024)
        .map((p) => ({
          label: p.province,
          value: p.poverty_2024,
          note: `${signed(p.poverty_2024 - p.poverty_2017)} pts since 2017`,
        })),
    [meta],
  );

  const health = meta?.calibration?.financial_health as Record<string, number> | undefined;

  // The three findings restate figures the ledger already carries, so they are pulled once
  // here rather than re-searched in the JSX.
  const provinceByName = useMemo(
    () => new Map((meta?.province_poverty ?? []).map((p) => [p.province, p])),
    [meta],
  );
  const west = provinceByName.get("West")?.poverty_2024;
  const kigali = provinceByName.get("Kigali City")?.poverty_2024;
  const vulnerable =
    health ? (health.vulnerable ?? 0) + (health.extremely_vulnerable ?? 0) : undefined;

  if (error) {
    return (
      <div className="shell pt-16">
        <PanelState kind="error" onRetry={retry}>
          Could not reach the API
        </PanelState>
      </div>
    );
  }

  return (
    <div>
      {/* Lead. Full-bleed brand blue with layered waves, flush under the blue header so the
          two read as one band: the hero is water the way the argument is — inclusion is a
          surface, resilience is depth. Waves are decorative, so the block is aria-hidden. */}
      <section className="relative isolate overflow-hidden bg-primary-deep text-white">
        <HeroWaves />
        {/* The country itself, centred behind the band. Decorative line work only — no fill
            scale, no values — so it cannot be mistaken for the choropleth further down. It
            sits at a fraction of text contrast so the copy stays readable over it. */}
        <RwandaWatermark className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-auto -translate-x-1/2 -translate-y-1/2 text-white/[0.10] md:h-[112%] 2xl:h-[120%]" />
        <div className="shell relative pb-44 pt-11 sm:pb-40 sm:pt-14">
          <Stagger className="max-w-[70ch]" step={0.08} delay={0.05}>
            <StaggerItem className="flex flex-wrap items-center gap-2">
              <Tag tone="real" className="bg-white/10 text-white">
                Financial inclusion &amp; poverty
              </Tag>
            </StaggerItem>
            <StaggerItem>
              <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[56px]">
                Inclusion is not resilience.
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="mt-5 text-[19.5px] leading-[1.65] text-primary-soft">
                Rwanda has done something remarkable:{" "}
                <strong className="font-semibold text-white">96%</strong> of adults are financially
                included. But <strong className="font-semibold text-white">34%</strong> remain
                financially vulnerable, and{" "}
                <strong className="font-semibold text-white">27.4%</strong> live below the poverty
                line. IMBERE turns that gap into three decisions a planner can actually make — where
                fragility sits, what shock tips households under, and which targeting rule reaches
                the poor most cheaply.
              </p>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <div className="shell">
          {/* Summary band */}
          <section className="mt-10" aria-label="National summary">
            <div className="mb-3">
              <div className="label text-primary">National summary</div>
            </div>
          <Ledger>
            {pending ? (
              <>
                <SkeletonKpi />
                <SkeletonKpi />
                <SkeletonKpi />
                <SkeletonKpi />
              </>
            ) : (
              <>
                <Kpi
                  label="Poverty rate"
                  value={meta ? pct(meta.national.poverty_rate_2024) : "—"}
                  note={
                    meta
                      ? `down ${Math.abs(meta.national.poverty_rate_2024 - meta.national.poverty_rate_2017).toFixed(1)} pts since 2017`
                      : undefined
                  }
                />
                <Kpi
                  label="Extreme poverty"
                  value={meta ? pct(meta.national.extreme_poverty_rate_2024) : "—"}
                  note={meta ? `was ${pct(meta.national.extreme_poverty_rate_2017)} in 2017` : undefined}
                />
                <Kpi
                  label="Financially vulnerable"
                  value={
                    health
                      ? pct((health.vulnerable ?? 0) + (health.extremely_vulnerable ?? 0), 0)
                      : "—"
                  }
                  note="vulnerable or extremely vulnerable, FinScope 2024"
                  tone="accent"
                />
                <Kpi
                  label="Stalled districts"
                  value={districts.length ? num(stalled) : "—"}
                  note="poverty fell by less than 5 pts since 2017"
                  tone="primary"
                />
              </>
            )}
          </Ledger>
        </section>

        {/* Roles, not features. The ledger states what is true nationally; this strip states
            who changes a decision because of it. Kept to one band so it never competes with
            the figures above it. */}
        <section className="mt-10 border-t border-line pt-6" aria-label="Built for">
          <div className="label text-primary">Built for</div>
          <div className="mt-4 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {USERS.map((u) => (
              <div key={u.who}>
                <div className="text-[17.5px] font-semibold leading-tight text-ink">{u.who}</div>
                <div className="mt-0.5 text-[14.5px] leading-snug text-ink-soft">{u.role}</div>
                <p className="mt-2 text-[15.5px] leading-relaxed text-ink">{u.does}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-[74ch] text-[15.5px] leading-relaxed text-ink-soft">
            Aligned with <strong className="font-semibold text-ink">NST2</strong> (Social
            Transformation) and <strong className="font-semibold text-ink">Vision 2050</strong>.
            The question is not who holds an account, but which rule moves the most poor
            households per franc — and what a shock does to the ones a rule misses.
          </p>
        </section>

        {/* What the figures say. Prose, not more numbers: the ledger holds the totals, so this
            row adds the reading between them and the map that proves it. */}
        {!pending ? (
          <section className="mt-8" aria-label="What the figures say">
            <Findings
              items={[
                {
                  kicker: "Where it sits",
                  children: (
                    <>
                      <strong className="tnum font-semibold">{pct(west)}</strong> of Western
                      Province lives below the line, roughly four times Kigali&apos;s{" "}
                      <strong className="tnum font-semibold">{pct(kigali)}</strong>. The national
                      average hides a four-fold gap.
                    </>
                  ),
                },
                {
                  kicker: "Where it stopped",
                  children: (
                    <>
                      <strong className="tnum font-semibold">
                        {stalled} of {districts.length}
                      </strong>{" "}
                      districts cut poverty by less than five points since 2017. Progress reached
                      most of the country and then stopped at these.
                    </>
                  ),
                },
                {
                  kicker: "Why inclusion is not resilience",
                  children: (
                    <>
                      <strong className="tnum font-semibold">{pct(health?.healthy, 0)}</strong> of
                      adults are financially healthy while{" "}
                      <strong className="tnum font-semibold">{pct(vulnerable, 0)}</strong> are
                      vulnerable or extremely vulnerable. Access arrived without the buffer to
                      absorb a shock.
                    </>
                  ),
                },
              ]}
            />
          </section>
        ) : null}

        {/* Geography: the map owns the wide left column, the ranked rail sits beside it.
            No card around the map — it sits on the paper, so the country is the panel. */}
        <section className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_286px]" aria-label="Geography">
          <div>
            <div className="mb-3">
              <div className="label">Where poverty is concentrated</div>
              <h2 className="display-sm mt-1 text-[24px]">Poverty rate by district, 2024</h2>
              <p className="mt-1.5 text-[14.5px] text-ink-soft">
                Click a district, or pick one from the list
              </p>
            </div>

            {districts.length ? (
              <RwandaMap
                districts={districts}
                onSelect={setSelected}
                focusBin={focusBin}
                onFocusBin={setFocusBin}
              />
            ) : pending ? (
              <Skeleton className="aspect-[620/580] w-full" />
            ) : (
              <PanelState kind="empty">
                {empty ? "The API returned no districts." : "No districts to map."}
              </PanelState>
            )}

            {/* Selected district, presented as a definition list rather than another card */}
            <div className="mt-6 border-t border-line pt-5">
              {sel ? (
                <motion.div
                  key={sel.district}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="grid gap-x-10 gap-y-6 sm:grid-cols-2"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="label">{sel.province}</div>
                        <h3 className="display-sm mt-1 text-[28px] leading-tight">
                          {sel.district}
                        </h3>
                      </div>
                      <Tag tone={sel.stalled_progress ? "warn" : "real"}>
                        {sel.stalled_progress ? "Stalled" : "Improving"}
                      </Tag>
                    </div>

                    <div className="mt-5 flex items-baseline gap-6">
                      <div>
                        <div className="label">Poverty</div>
                        <div className="tnum mt-1 text-[33px] font-semibold leading-none">
                          {pct(sel.poverty_2024)}
                        </div>
                      </div>
                      <div>
                        <div className="label">Since 2017</div>
                        <div
                          className={`tnum mt-1 text-[24px] font-semibold leading-none ${
                            sel.poverty_change_pp > -5 ? "text-accent" : "text-teal"
                          }`}
                        >
                          {signed(sel.poverty_change_pp)} pp
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="label">Poverty, 2017 → 2024</div>
                      <div className="mt-2 space-y-2">
                        <MiniBar label="2017" value={sel.poverty_2017} max={70} muted />
                        <MiniBar label="2024" value={sel.poverty_2024} max={70} />
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-baseline justify-between">
                        <span className="label">Financial health</span>
                        <span className="text-[12.5px] text-ink-soft">calibrated</span>
                      </div>
                      <motion.div
                        className="mt-2 flex h-3 origin-left overflow-hidden rounded-full"
                        aria-hidden
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={inView}
                        transition={{ duration: 0.7, ease: EASE }}
                      >
                        {HEALTH.map((h) => (
                          <span
                            key={h.key}
                            style={{
                              width: `${sel.financial_health[h.key]}%`,
                              background: h.color,
                            }}
                          />
                        ))}
                      </motion.div>
                      <div className="mt-2 flex justify-between text-[14px] text-ink-soft">
                        <span>
                          <span className="tnum font-medium text-ink">
                            {pct(
                              sel.financial_health.vulnerable + sel.financial_health.extremely_vulnerable,
                              0,
                            )}
                          </span>{" "}
                          vulnerable
                        </span>
                        <span>
                          <span className="tnum font-medium text-ink">
                            {pct(sel.financial_health.healthy, 0)}
                          </span>{" "}
                          healthy
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <dl className="space-y-2 text-[16px]">
                      <Row label="People below the line" value={compact(sel.poor_people)} />
                      <Row label="Households affected" value={compact(sel.poor_households)} />
                      <Row
                        label="Share of Rwanda's poor"
                        value={
                          meta ? pct((sel.poor_people / meta.national.poor_people) * 100, 1) : "—"
                        }
                      />
                      <Row
                        label="Poverty rank"
                        value={`#${districts.length - sel.poverty_rank_2024 + 1} of ${districts.length}`}
                      />
                      <Row label="Mobile money coverage" value={pct(sel.momo_coverage, 0)} />
                      <Row label="Savings account coverage" value={pct(sel.savings_coverage, 0)} />
                      <Row label="Reported a severe shock" value={pct(sel.shock_incidence, 0)} />
                      <Row label="Resilience index" value={`${sel.resilience_index}/100`} />
                    </dl>

                    <Link
                      href={`/simulator?district=${encodeURIComponent(sel.district)}`}
                      className="group mt-6 inline-flex items-center gap-2 border-b border-primary/40 pb-0.5 text-[16px] font-medium text-primary-deep transition hover:border-primary"
                    >
                      Simulate a shock in {sel.district}
                      <svg
                        aria-hidden
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                      </svg>
                    </Link>

                    <SourceNote kind="measured">
                      EICV7 Annex B; population and households from Census 2022.
                    </SourceNote>
                  </div>
                </motion.div>
              ) : pending ? (
                <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                  <div>
                    <Skeleton className="h-[10px] w-20" />
                    <Skeleton className="mt-2 h-[26px] w-40" />
                    <div className="mt-5 flex items-baseline gap-6">
                      <div>
                        <Skeleton className="h-[10px] w-14" />
                        <Skeleton className="mt-2 h-[30px] w-20" />
                      </div>
                      <div>
                        <Skeleton className="h-[10px] w-16" />
                        <Skeleton className="mt-2 h-[22px] w-16" />
                      </div>
                    </div>
                    <Skeleton className="mt-5 h-[5px] w-full" />
                    <Skeleton className="mt-2 h-[5px] w-full" />
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div
                        key={i}
                        className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1.5"
                      >
                        <Skeleton className="h-[11px]" style={{ width: `${38 + (i % 3) * 12}%` }} />
                        <Skeleton className="h-[11px] w-14" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[16px] text-ink-soft">Select a district on the map or in the rail.</p>
              )}
            </div>
          </div>

          {/* Ranked index beside the map. Highest poverty first, so the rail and the map answer
              different questions from the same numbers. */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="label">Districts · poverty 2024</h2>
              <span className="label">Rate</span>
            </div>
            {districts.length ? (
              <DistrictRail districts={districts} selected={selected} onSelect={setSelected} />
            ) : pending ? (
              <DistrictRailSkeleton />
            ) : (
              <PanelState kind="empty">No districts to list.</PanelState>
            )}
            <SourceNote kind="measured">
              Headcount poverty by district, EICV7 Annex B. Sorted highest first.
            </SourceNote>
          </div>
        </section>

        {/* Province + financial health, side by side: the province ranking on the left,
            the FinScope split on the right, so both halves of the inclusion story sit on
            one line instead of stacking into two full-width blocks. */}
        <section className="mt-12 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-2">
          <div className="border-t border-line pt-6">
            <SectionHeading title="Poverty by province">
              The Western and Southern provinces carry poverty rates roughly four times
              Kigali&apos;s.
            </SectionHeading>
            {meta ? (
              <div className="w-full">
                <BarList
                  items={provinceItems}
                  format={(v) => pct(v)}
                  max={45}
                  colorFor={(item) => binColor(item.value)}
                />
                <p className="mt-1 text-[14px] text-ink-soft">
                  Shaded on the same bins as the district map above.
                </p>
              </div>
            ) : (
              <SkeletonBars rows={4} />
            )}
            <SourceNote kind="measured">EICV7 Table 5.1.</SourceNote>
          </div>

          <div className="border-t border-line pt-6">
            <SectionHeading title="Financial health, not just access">
              Only 10% of adults are financially healthy. Access has raced ahead of the ability to
              absorb a shock.
            </SectionHeading>
            {health ? (
              <DonutChart
                items={HEALTH.map((h) => ({
                  label: h.label,
                  value: health[h.key],
                  color: h.color,
                }))}
                format={(v) => `${v.toFixed(0)}%`}
              />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Skeleton className="h-[200px] w-[200px] rounded-full" />
                <div className="w-full space-y-2">
                  {HEALTH.map((h) => (
                    <Skeleton key={h.key} className="h-[12px] w-full" />
                  ))}
                </div>
              </div>
            )}
            <SourceNote kind="measured">FinScope 2024, national sample.</SourceNote>
          </div>
        </section>

        {/* Shocks */}
        <section className="mt-12">
          <div className="border-t border-line pt-6">
            <SectionHeading title="What actually knocks households down">
              37.1% of households reported at least one severe shock. Poor households cope by eating
              less and working more; non-poor households draw down savings and borrow.
            </SectionHeading>
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <h3 className="label mb-3">Main shock faced</h3>
                <DonutChart
                  items={(meta?.shocks?.shock_types ?? []).map((s) => ({
                    label: s.label,
                    value: s.all,
                  }))}
                  format={(v) => `${v.toFixed(1)}%`}
                />
              </div>
              <div>
                <h3 className="label mb-3">How households responded</h3>
                <BarList
                  items={(meta?.shocks?.coping_responses ?? []).map((c) => ({
                    label: c.label,
                    value: c.all,
                    note: `poor ${c.poor}% · non-poor ${c.non_poor}%`,
                  }))}
                  format={(v) => `${v.toFixed(1)}%`}
                  max={32}
                  color="accent"
                />
              </div>
            </div>
            <SourceNote kind="measured">EICV7 Tables 6.10 / 6.11.</SourceNote>
          </div>
        </section>

        {/* Next */}
        <div className="mb-3">
          <div className="label text-primary">Continue exploring</div>
        </div>
        <section className="grid gap-6 sm:grid-cols-2" aria-label="Explore the tools">
          <Link
            href="/simulator"
            className="group flex flex-col gap-3 rounded-md border border-line bg-surface p-6 transition-colors hover:border-primary"
          >
            <h3 className="display-sm text-[22px] text-ink">Shock simulator</h3>
            <p className="text-[15.5px] leading-relaxed text-ink-soft">
              Pick a district and a shock. See how many households fall below the line and what it
              costs to catch them.
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-[15px] font-medium text-primary-deep">
              Open
              <svg
                aria-hidden
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </span>
          </Link>
          <Link
            href="/targeting"
            className="group flex flex-col gap-3 rounded-md border border-line bg-surface p-6 transition-colors hover:border-primary"
          >
            <h3 className="display-sm text-[22px] text-ink">Targeting lab</h3>
            <p className="text-[15.5px] leading-relaxed text-ink-soft">
              Compare universal, geographic, community and proxy-means targeting on the same budget.
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-[15px] font-medium text-primary-deep">
              Open
              <svg
                aria-hidden
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </span>
          </Link>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  );
}

/** Layered crests behind the hero copy. Decorative, so it stays out of the a11y tree. */
function HeroWaves() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* One flat brand blue, exactly the header's, so the two bands read as a single
          container; depth comes from the crests, not a gradient that would show a seam. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[104px] w-full sm:h-[148px]"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d="M0,96 C150,50 310,126 490,102 C670,78 810,20 990,44 C1170,68 1310,120 1440,96 L1440,200 L0,200 Z"
          className="fill-white/10"
        />
        <path
          d="M0,130 C170,104 330,158 510,146 C690,134 830,86 1010,102 C1190,118 1310,160 1440,142 L1440,200 L0,200 Z"
          className="fill-white/20"
        />
        <path
          d="M0,108 C180,80 340,136 520,122 C700,108 840,60 1020,78 C1200,96 1320,140 1440,120"
          className="fill-none stroke-white/40"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Front swell in the page colour, so the panel melts into the paper below. */}
        <path
          d="M0,160 C170,138 330,178 510,170 C690,162 850,132 1030,146 C1210,160 1330,188 1440,168 L1440,200 L0,200 Z"
          className="fill-paper"
        />
      </svg>
    </div>
  );
}

function MiniBar({
  label,
  value,
  max,
  muted = false,
}: {
  label: string;
  value: number;
  max: number;
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-[34px_1fr_46px] items-center gap-2">
      <span className="text-[12.5px] uppercase tracking-[0.08em] text-ink-soft">{label}</span>
      <span className="h-[5px] overflow-hidden rounded-[1px] bg-line" aria-hidden>
        <MotionBar
          as="span"
          className={`block h-full ${muted ? "bg-[#acaeb0]" : "bg-[#004077]"}`}
          value={Math.max(2, (value / max) * 100)}
        />
      </span>
      <span className="tnum text-right text-[14.5px] font-medium">{pct(value)}</span>
    </div>
  );
}
