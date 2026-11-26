"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { SLIDE_EASE } from "@/components/Motion";
import { BranchDiagram } from "@/components/BranchDiagram";
import { HERO } from "@/content/home";

const ROTATE_MS = 5000;

/**
 * The hero's right column alternates two readings of the same evidence: the composition of
 * inclusion, then what inclusion did not buy. Both slides stay mounted so the column keeps a
 * stable height and the branch only counts up once.
 *
 * Rotation stops on hover, on keyboard focus, and under `prefers-reduced-motion`. The pause
 * control is there for everyone else, since the slide changes on its own every five seconds.
 */
export function HeroSlides({
  included,
  formal,
  informalOnly,
  vulnerable,
  poverty,
}: {
  included: number | null;
  formal: number | null;
  informalOnly: number | null;
  vulnerable: number | null;
  poverty: number | null;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const still = Boolean(reduced) || paused || hovered || focused;

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % 2), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [still]);

  return (
    <div
      data-hero-slides
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <div className="grid overflow-hidden">
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="col-start-1 row-start-1"
            initial={false}
            animate={{
              opacity: index === i ? 1 : 0,
              x: index === i ? 0 : i === 0 ? -40 : 40,
            }}
            transition={{
              duration: index === i ? 0.6 : 0.3,
              ease: SLIDE_EASE,
              delay: index === i ? 0.08 : 0,
            }}
            style={{ pointerEvents: index === i ? "auto" : "none" }}
            aria-hidden={index !== i}
          >
            {i === 0 ? (
              <BranchDiagram
                inverted
                stacked
                total={{ value: included, label: HERO.branch.total }}
                branches={[
                  { value: formal, label: HERO.branch.formal },
                  { value: informalOnly, label: HERO.branch.informal },
                ]}
              />
            ) : (
              <div className="flex h-full items-center rounded-lg border border-white/15 bg-white/5 px-6 py-8">
                <motion.p
                  className="text-[22px] leading-[1.55] text-primary-soft"
                  initial={false}
                  animate={
                    index === 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }
                  }
                  transition={{ duration: 0.5, ease: SLIDE_EASE, delay: index === 1 ? 0.2 : 0 }}
                >
                  <Figure value={included} /> {HERO.slide.included} <Figure value={vulnerable} />{" "}
                  {HERO.slide.vulnerable} <Figure value={poverty} /> {HERO.slide.poverty}
                </motion.p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-1">
        {[0, 1].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={i === 0 ? "Show financial inclusion" : "Show financial vulnerability"}
            aria-current={index === i ? "true" : undefined}
            className="flex h-6 w-6 items-center justify-center"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                index === i ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/60"
              }`}
            />
          </button>
        ))}

        <span aria-hidden className="mx-1 h-3 w-px bg-white/20" />

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the slideshow" : "Pause the slideshow"}
          className="flex h-6 w-6 items-center justify-center text-white/50 transition-colors hover:text-white"
        >
          {paused ? (
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          ) : (
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="7" y="5" width="3.5" height="14" rx="1" />
              <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
            </svg>
          )}
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        Slide {index + 1} of 2
      </p>
    </div>
  );
}

/** A figure on the navy band, with the percent sign kept in the text face. */
function Figure({ value }: { value: number | null }) {
  if (value == null) return <>—</>;
  const digits = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <span className="tnum text-[1.25em] font-semibold leading-none text-white">
      {digits}
      <span className="pct-sign">%</span>
    </span>
  );
}
