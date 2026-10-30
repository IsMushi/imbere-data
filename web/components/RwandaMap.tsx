"use client";

import { geoMercator, geoPath } from "d3-geo";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { District } from "@/lib/api";

type Feature = {
  type: string;
  properties: { shapeName: string };
  geometry: unknown;
};
type Geo = { type: string; features: Feature[] };

// Legend bins mirror the EICV7 Poverty Profile map so the two can be read side by side.
// The map now sits on the paper rather than on a white card, so the two lightest bins are
// deepened: #e3edf7 on #eef1f5 disappeared into the page.
const BINS = [
  { max: 20, color: "#cfe0f0", ink: "#0d2343", label: "Less than 20" },
  { max: 30, color: "#a5c5e1", ink: "#0d2343", label: "20 – 30" },
  { max: 40, color: "#5b93c4", ink: "#0d2343", label: "31 – 40" },
  { max: 50, color: "#196cb3", ink: "#ffffff", label: "41 – 50" },
  { max: Infinity, color: "#004077", ink: "#ffffff", label: "51 and above" },
];

/** Index of the bin a poverty rate falls in. Shared by the legend filter and the colours. */
export function binIndex(v: number): number {
  const i = BINS.findIndex((b) => v < b.max);
  return i === -1 ? BINS.length - 1 : i;
}

/**
 * Colour for a poverty rate. Exported so other charts (the province bar list, the district
 * rail) use the same bins as the map instead of inventing a second scale.
 */
export function binColor(v: number): string {
  return BINS[binIndex(v)].color;
}

/**
 * Readable text colour on top of `binColor(v)`. The two lightest bins take ink; the two
 * darkest take white. Kept beside the bins so a palette change updates both at once.
 */
export function binInk(v: number): string {
  return BINS[binIndex(v)].ink;
}

export function RwandaMap({
  districts,
  onSelect,
  focusBin = null,
  onFocusBin,
}: {
  districts: District[];
  onSelect: (name: string) => void;
  /** Bin currently isolated by the legend, or null for "show all". */
  focusBin?: number | null;
  onFocusBin?: (bin: number | null) => void;
}) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/rwanda-districts.geojson")
      .then((r) => r.json())
      .then((g: Geo) => {
        if (alive) setGeo(g);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const byName = useMemo(
    () => new Map(districts.map((d) => [d.district, d])),
    [districts],
  );

  const { paths, viewBox } = useMemo(() => {
    if (!geo) return { paths: [], viewBox: "0 0 620 580" };
    const projection = geoMercator().fitExtent(
      [
        [10, 10],
        [610, 570],
      ],
      geo as never,
    );
    const path = geoPath(projection);
    const paths = geo.features.map((f) => ({
      name: f.properties.shapeName,
      d: path(f as never) ?? "",
    }));

    // Crop the canvas to the country's actual outline so the map fills the card
    // instead of floating in a wide empty frame.
    const [[x0, y0], [x1, y1]] = path.bounds(geo as never);
    const pad = 6;
    return {
      paths,
      viewBox: `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(
        x1 - x0 + pad * 2
      ).toFixed(1)} ${(y1 - y0 + pad * 2).toFixed(1)}`,
    };
  }, [geo]);

  const hovered = hover ? byName.get(hover.name) : null;

  return (
    // Legend parks in the bottom-right of the country on wide screens and drops beneath it
    // on narrow ones, where a side column would squeeze the map.
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="relative min-w-0 flex-1">
        {/* The map is a visual aid, not a control: every district it draws is also a row in the
            ranked list beside it, which is keyboard-operable and carries the same figures. So it
            is hidden from assistive tech rather than pretending to be 30 unfocusable buttons —
            `role="img"` around `role="button"` children pruned them from the a11y tree anyway. */}
        <svg
          viewBox={viewBox}
          className="w-full"
          aria-hidden="true"
          focusable="false"
        >
          {paths.map((p) => {
            const d = byName.get(p.name);
            const inFocus =
              focusBin === null || (d ? binIndex(d.poverty_2024) === focusBin : false);
            return (
              <path
                key={p.name}
                d={p.d}
                fill={d ? binColor(d.poverty_2024) : "#dfe4ea"}
                // A legend band narrows the map to its own districts; the rest stay in place,
                // faint, so the country's shape and the selected district never jump.
                opacity={inFocus ? 1 : 0.22}
                // No selection outline: the district panel and the rail carry the selection,
                // and a fat dark ring fought the choropleth's own colour scale.
                stroke="var(--color-paper)"
                strokeWidth={0.9}
                className="cursor-pointer outline-none transition-[fill,stroke,opacity] hover:brightness-95"
                onClick={() => onSelect(p.name)}
                onMouseEnter={() => setHover({ name: p.name, x: 0, y: 0 })}
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  if (!box) return;
                  setHover({ name: p.name, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>

        <AnimatePresence>
          {hover && hovered ? (
            <motion.div
              key="district-tooltip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[125%] rounded-lg border border-line bg-surface px-3 py-2 shadow-lg"
              style={{ left: hover.x, top: hover.y }}
            >
              <div className="text-[16px] font-semibold">{hovered.district}</div>
              <div className="tnum text-[14px] text-ink-soft">
                {hovered.poverty_2024}% poor · {hovered.province}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="sm:w-[152px] sm:shrink-0">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 sm:flex-col sm:items-stretch sm:gap-y-0.5">
          {BINS.map((b, i) => {
            const active = focusBin === i;
            return (
              <button
                key={b.label}
                type="button"
                aria-pressed={active}
                aria-label={`Highlight districts in the ${b.label}% poverty band`}
                onClick={() => onFocusBin?.(active ? null : i)}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:justify-start ${
                  active
                    ? "bg-surface font-semibold text-ink ring-1 ring-primary"
                    : "text-ink-soft hover:bg-hover hover:text-ink"
                }`}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ background: b.color }}
                />
                {b.label}
              </button>
            );
          })}
          <span className="text-[14px] leading-[1.4] text-ink-soft sm:mt-2">
            % of population below the poverty line
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-[1.45] text-ink-soft" aria-live="polite">
          {focusBin === null
            ? "Select a band to isolate those districts."
            : `${districts.filter((d) => binIndex(d.poverty_2024) === focusBin).length} districts in this band · select it again to show all`}
        </p>
      </div>
    </div>
  );
}
