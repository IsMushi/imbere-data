"use client";

import { useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function MultiLine({
  data,
  series,
  xKey,
  xLabel,
  yLabel,
  yMax,
  format = (v: number) => `${v.toFixed(0)}%`,
}: {
  data: Record<string, number>[];
  series: { id: string; label: string; color: string }[];
  xKey: string;
  xLabel: string;
  yLabel: string;
  yMax?: number;
  format?: (v: number) => string;
}) {
  const reduced = useReducedMotion();
  const top =
    yMax ?? Math.max(...data.flatMap((d) => series.map((s) => d[s.id] ?? 0)), 1);

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 10, right: 14, left: 8, bottom: 34 }}>
          <CartesianGrid stroke="#dfe4ea" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 13, fill: "#37404d" }}
            tickLine={false}
            axisLine={{ stroke: "#dfe4ea" }}
            label={{ value: xLabel, position: "insideBottom", offset: -18, fontSize: 13, fill: "#37404d" }}
          />
          <YAxis
            domain={[0, top]}
            tickFormatter={(v) => format(Number(v))}
            tick={{ fontSize: 13, fill: "#37404d" }}
            tickLine={false}
            axisLine={{ stroke: "#dfe4ea" }}
            width={52}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              offset: 8,
              fontSize: 13,
              fill: "#37404d",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            formatter={(value, name) => [format(Number(value)), name]}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #dfe4ea",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12.5, color: "#37404d", paddingTop: 12 }}
            content={({ payload }) => (
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-3 text-[12.5px] text-ink-soft">
                {(payload ?? []).map((entry, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-[2px] w-4 rounded-full"
                      style={{ background: entry.color }}
                    />
                    {entry.value}
                  </span>
                ))}
              </div>
            )}
          />
          {series.map((s) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.14}
              strokeWidth={2}
              isAnimationActive={!reduced}
              dot={{ r: 3, fill: "#ffffff", stroke: s.color, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}