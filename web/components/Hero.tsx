"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Stagger, StaggerItem } from "@/components/Motion";
import { RwandaWatermark } from "@/components/RwandaWatermark";
import { StatCard } from "@/components/StatCard";
import { Tag } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { HERO } from "@/content/home";
import type { Meta } from "@/lib/api";
import { pctAuto } from "@/lib/format";

/**
 * The first screen: one claim, three published numbers on the right, two ways in. Every
 * figure is read from /api/meta; nothing is typed by hand.
 */
export function Hero({ meta }: { meta: Meta | null }) {
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

  return (
    <section className="relative isolate overflow-hidden bg-primary-deep text-white">
      <HeroWaves />
      <RwandaWatermark className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-auto -translate-x-1/2 -translate-y-1/2 text-white/[0.10] md:h-[112%] 2xl:h-[120%]" />

      <div className="shell relative pb-28 pt-11 sm:pt-14 lg:pb-32">
        {/* One column on a phone: claim, numbers, action. On wide screens the numbers move
            to the right and the claim keeps the left. */}
        <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-12 lg:gap-y-7">
          <Stagger className="lg:col-start-1 lg:row-start-1" step={0.08} delay={0.05}>
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
          </Stagger>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:grid-cols-1">
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

          <Stagger className="lg:col-start-1 lg:row-start-2" step={0.08} delay={0.2}>
            <StaggerItem>
              <div className="flex flex-col gap-3 sm:flex-row">
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
