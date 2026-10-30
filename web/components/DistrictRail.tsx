"use client";

import { motion } from "framer-motion";

import { fadeUp, inView, MotionBar, stagger } from "@/components/Motion";
import { binColor, binInk } from "@/components/RwandaMap";
import { Skeleton } from "@/components/ui/skeleton";
import type { District } from "@/lib/api";

/**
 * Persistent district selector. Sorted by poverty, keyboard-operable, and readable
 * without the map: rank, name, relative bar, rate. Colour comes from the map's bins so
 * a rate reads the same in the rail as it does on the choropleth.
 */

export function DistrictRail({
  districts,
  selected,
  onSelect,
}: {
  districts: District[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const sorted = [...districts].sort((a, b) => b.poverty_2024 - a.poverty_2024);
  const max = Math.max(...sorted.map((d) => d.poverty_2024), 1);

  return (
    <div className="max-h-[560px] overflow-y-auto rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(13,35,67,0.05),0_8px_24px_-12px_rgba(13,35,67,0.1)] [scrollbar-width:thin]">
      <motion.ul
        className="divide-y divide-line/70"
        initial="hidden"
        whileInView="show"
        viewport={inView}
        variants={stagger(0.012)}
      >
        {sorted.map((d, i) => {
          const isSel = d.district === selected;
          return (
            <motion.li key={d.district} variants={fadeUp}>
              <button
                type="button"
                onClick={() => onSelect(d.district)}
                aria-pressed={isSel}
                className={`relative grid w-full grid-cols-[26px_1fr_auto] items-center gap-x-3 px-4 py-3 text-left transition-colors ${
                  isSel ? "bg-primary-soft/50" : "hover:bg-hover"
                }`}
              >
                {isSel ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary"
                  />
                ) : null}
                <span
                  className={`tnum text-[13px] ${
                    i < 3 ? "font-semibold text-ink" : "text-ink-soft"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-[15.5px] ${
                      isSel ? "font-semibold text-primary-deep" : "text-ink"
                    }`}
                  >
                    {d.district}
                  </span>
                  <span className="mt-1.5 block h-[5px] w-full overflow-hidden rounded-full bg-line/70" aria-hidden>
                    <MotionBar
                      as="span"
                      className="block h-full rounded-full"
                      style={{ backgroundColor: binColor(d.poverty_2024) }}
                      value={Math.max(3, (d.poverty_2024 / max) * 100)}
                    />
                  </span>
                </span>
                <span
                  className="tnum min-w-[58px] rounded-[3px] px-1.5 py-[3px] text-center text-[14px] font-semibold"
                  style={{
                    backgroundColor: binColor(d.poverty_2024),
                    color: binInk(d.poverty_2024),
                  }}
                >
                  {d.poverty_2024.toFixed(1)}%
                </span>
              </button>
            </motion.li>
          );
        })}
      </motion.ul>
    </div>
  );
}

/** Rail placeholder for the first paint, before `/api/districts` resolves. */
export function DistrictRailSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="max-h-[560px] overflow-hidden rounded-xl border border-line bg-surface">
      <ul className="divide-y divide-line/70">
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="grid grid-cols-[26px_1fr_auto] items-center gap-x-3 px-4 py-3"
          >
            <span className="tnum text-[13px] text-ink-soft">{i + 1}</span>
            <div>
              <Skeleton className="h-[13px]" style={{ width: `${45 + (i % 4) * 8}%` }} />
              <Skeleton className="mt-1.5 h-[5px] w-full rounded-full" />
            </div>
            <Skeleton className="h-[13px] w-12" />
          </li>
        ))}
      </ul>
    </div>
  );
}