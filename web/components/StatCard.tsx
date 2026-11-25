import type { ReactNode } from "react";

/**
 * One number with a small label under it. The hero uses the inverted variant on the deep
 * blue band; on light surfaces the same card reads as a plain figure tile.
 */
export function StatCard({
  value,
  label,
  inverted = false,
}: {
  value: ReactNode;
  label: string;
  inverted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 sm:px-4 ${
        inverted ? "border-white/15 bg-white/5" : "border-line bg-surface"
      }`}
    >
      <div
        className={`tnum text-[24px] font-semibold leading-none tracking-[-0.02em] sm:text-[30px] ${
          inverted ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-2 text-[11.5px] leading-snug sm:text-[12.5px] ${
          inverted ? "text-primary-soft" : "text-ink-soft"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
