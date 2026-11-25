"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Stagger, StaggerItem } from "@/components/Motion";
import { RwandaWatermark } from "@/components/RwandaWatermark";
import { StatCard } from "@/components/StatCard";
import { Tag } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { HERO } from "@/content/home";
import type { District, Meta } from "@/lib/api";
import { pct, pctAuto } from "@/lib/format";

/**
 * The first screen. One claim, three published numbers, two ways in, and a live district
 * ranking on the right. Every figure is read from /api/meta or /api/districts; nothing is
 * typed by hand. The ranking is the model's, so it carries an Estimate badge.
 */
export function Hero({
  meta,
  districts,
}: {
  meta: Meta | null;
  districts: District[];
}) {
  // Published indicators, keyed by id so the labels and values cannot drift apart.
  const indicators = useMemo(
    () => new Map((meta?.indicators ?? []).map((item) => [item.id, item.value])),
    [meta],
  );

  const included = indicators.get("financial_inclusion");
  const vulnerableBase = indicators.get("financially_vulnerable");
  const vulnerableExtreme = indicators.get("financially_extremely_vulnerable");
  const vulnerable =
    vulnerableBase != null && vulnerableExtreme != null
      ? vulnerableBase + vulnerableExtreme
      : undefined;
  const poverty = indicators.get("poverty_headcount");

  const topRisk = useMemo(
    () => [...districts].sort((a, b) => b.mean_risk - a.mean_risk).slice(0, 3),
    [districts],
  );

  return (
    <section className="relative isolate overflow-hidden bg-primary-deep text-white">
      <HeroWaves />
      <RwandaWatermark className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-auto -translate-x-1/2 -translate-y-1/2 text-white/[0.10] md:h-[112%] 2xl:h-[120%]" />

      <div className="shell relative pb-28 pt-11 sm:pt-14 lg:pb-32">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* The argument */}
          <Stagger step={0.08} delay={0.05}>
            <StaggerItem className="flex flex-wrap items-center gap-2">
              <Tag tone="real" className="bg-white/10 text-white">
                {HERO.eyebrow}
              </Tag>
            </StaggerItem>

            <StaggerItem>
              <h1 className="display mt-5 max-w-[18ch] text-[36px] leading-[1.04] sm:text-[56px]">
                {HERO.headline}
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-5 max-w-[52ch] text-[18px] leading-[1.6] text-primary-soft sm:text-[19.5px]">
                {HERO.body}
              </p>
            </StaggerItem>

            <StaggerItem>
              <div className="mt-7 grid max-w-[540px] grid-cols-3 gap-2.5 sm:gap-3">
                <StatCard
                  inverted
                  value={included != null ? pctAuto(included) : "—"}
                  label={HERO.stats.included}
                />
                <StatCard
                  inverted
                  value={vulnerable != null ? pctAuto(vulnerable) : "—"}
                  label={HERO.stats.vulnerable}
                />
                <StatCard
                  inverted
                  value={poverty != null ? pctAuto(poverty) : "—"}
                  label={HERO.stats.poverty}
                />
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="w-full bg-white text-primary-deep hover:bg-primary-soft sm:w-auto"
                >
                  <Link href="/simulator">{HERO.primaryCta}</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  <Link href="/proof">{HERO.secondaryCta}</Link>
                </Button>
              </div>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-6 flex flex-wrap items-center gap-2 text-[13px] text-primary-soft">
                <Tag tone="real" className="bg-white/10 text-white">
                  Measured
                </Tag>
                {HERO.trust}
              </p>
            </StaggerItem>
          </Stagger>

          {/* Where fragility sits: the model's own ranking, with the published rate beside it. */}
          <div className="rounded-xl border border-line bg-surface p-5 text-ink shadow-[0_18px_40px_-24px_rgba(13,35,67,0.45)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="label">{HERO.risk.title}</h2>
              <Tag tone="estimate">{HERO.risk.badge}</Tag>
            </div>

            {topRisk.length > 0 ? (
              <ul className="mt-4 space-y-3.5">
                {topRisk.map((district) => (
                  <li key={district.district}>
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="font-medium text-ink">{district.district}</span>
                      <span className="tnum text-ink-soft">
                        {pct(district.mean_risk * 100, 1)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(4, district.mean_risk * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[12px] text-ink-soft">
                      {pct(district.poverty_2024)} {HERO.risk.published}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[13px] text-ink-soft">{HERO.risk.loading}</p>
            )}

            <p className="mt-4 border-t border-line pt-3 text-[12px] leading-snug text-ink-soft">
              {HERO.risk.note}
            </p>
          </div>
        </div>
      </div>
    </section>
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
