"use client";

import { useReducedMotion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const PALETTE = ["#005cab", "#c95100", "#008482", "#196cb3", "#5b93c4", "#0d2343", "#a5c5e1"];

export function DonutChart({
  items,
  format = (v: number) => `${v.toFixed(1)}%`,
  centerLabel,
  centerValue,
}: {
  items: { label: string; value: number; color?: string }[];
  format?: (v: number) => string;
  /** Small label rendered in the centre of the donut. */
  centerLabel?: string;
  /** Value rendered in the centre of the donut. */
  centerValue?: string;
}) {
  const reduced = useReducedMotion();
  const data = items.map((it, i) => ({
    name: it.label,
    value: it.value,
    fill: it.color ?? PALETTE[i % PALETTE.length],
  }));
  const resolvedCenterValue = centerValue;
  const resolvedCenterLabel = centerLabel;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={84}
              paddingAngle={2}
              cornerRadius={2}
              isAnimationActive={!reduced}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} stroke="#ffffff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => format(Number(value))}
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #dfe4ea",
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {(resolvedCenterLabel || resolvedCenterValue) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {resolvedCenterValue && (
              <span className="tnum text-[20px] font-semibold leading-none text-ink">{resolvedCenterValue}</span>
            )}
            {resolvedCenterLabel && (
              <span className="mt-1 text-[11px] leading-tight text-ink-soft">{resolvedCenterLabel}</span>
            )}
          </div>
        )}
      </div>
      <ul className="flex flex-col gap-y-2">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-[14px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.fill }} />
            <span className="text-ink-soft">{d.name}</span>
            <span className="tnum font-medium text-ink">{format(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}