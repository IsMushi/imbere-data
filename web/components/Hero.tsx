"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Stagger, StaggerItem } from "@/components/Motion";
import { HeroSlides } from "@/components/HeroSlides";
import { RwandaWatermark } from "@/components/RwandaWatermark";
import { Tag } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { HERO } from "@/content/home";
import { apiPost, type Meta, type TargetingResponse } from "@/lib/api";

/**
 * The first screen: one claim, the composition of financial inclusion on the right, two ways
 * in. Every figure is read from /api/meta; nothing is typed by hand.
 */
export function Hero({ meta }: { meta: Meta | null }) {
  // Published indicators, keyed by id so the labels and values cannot drift apart.
  const indicators = useMemo(
    () => new Map((meta?.indicators ?? []).map((item) => [item.id, item.value])),
    [meta],
  );

  const included = indicators.get("financial_inclusion");
  const informalOnly = indicators.get("informal_only");
  // The formal share is the remainder of the published included figure once informal-only use
  // is taken out.
  const formal =
    included != null && informalOnly != null ? included - informalOnly : undefined;

  // The consequence sentence quotes a ratio, so it is read from the same endpoint the targeting
  // page uses rather than typed here. A cold API start simply delays it; a failure drops it.
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    apiPost<TargetingResponse>("/api/targeting", {
      budget_total: 300_000_000,
      transfer_per_beneficiary: 150_000,
    })
      .then((d) => {
        const pmt = d.results.find((r) => r.id === "pmt");
        const universal = d.results.find((r) => r.id === "universal");
        if (!alive || !pmt || !universal || !(universal.coverage_of_poor > 0)) return;
        setRatio(pmt.coverage_of_poor / universal.coverage_of_poor);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // The second slide's figures, from the same published set as the first.
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
        <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-12 lg:gap-y-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <Stagger className="lg:col-start-1 lg:row-start-1" step={0.08} delay={0.05}>
            <StaggerItem>
              <h1 className="display max-w-[18ch] text-[36px] leading-[1.04] sm:text-[56px]">
                {HERO.headline}
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-5 max-w-[52ch] text-[18px] leading-[1.6] text-primary-soft sm:text-[19.5px]">
                {HERO.body}
                {ratio != null ? (
                  <>
                    {" "}
                    <span className="text-white">
                      {HERO.consequence.replace("{ratio}", ratio.toFixed(1))}
                    </span>
                  </>
                ) : null}
              </p>
            </StaggerItem>
          </Stagger>

          <div className="w-full max-w-[520px] lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:max-w-none">
            {/* Two readings of the same evidence, rotating: the split of inclusion, then what
                inclusion did not buy. Paused on hover, focus and reduced motion. */}
            <HeroSlides
              included={included ?? null}
              formal={formal ?? null}
              informalOnly={informalOnly ?? null}
              vulnerable={vulnerable ?? null}
              poverty={poverty ?? null}
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
