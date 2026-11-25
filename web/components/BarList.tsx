"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function BarList({
  items,
  format = (v: number) => v.toFixed(1),
  max,
  highlight,
  color = "primary",
  highlightColor = "accent",
  colorFor,
  valueLabels = false,
}: {
  items: { label: string; value: number; note?: string }[];
  format?: (v: number) => string;
  max?: number;
  highlight?: string;
  color?: "primary" | "accent" | "ink";
  /** Emphasis colour for the highlighted row. Use "teal" when the standout is good news. */
  highlightColor?: "accent" | "teal";
  /**
   * Per-row fill, e.g. `binColor` from the district map. Wins over `color`/`highlight`,
   * and is drawn at full opacity — a binned fill already carries the meaning, so fading
   * it would fight the legend.
   */
  colorFor?: (item: { label: string; value: number }) => string;
  /**
   * Print the formatted value at the end of each bar. Rows without a `note` leave the
   * reserved right margin empty, so this costs no width and saves a trip to the axis.
   */
  valueLabels?: boolean;
}) {
  const fill = color === "accent" ? "#c95100" : color === "ink" ? "#0d2343" : "#005cab";
  const hiFill = highlightColor === "teal" ? "#008482" : "#c95100";
  const data = items.map((item) => ({
    name: item.label,
    value: item.value,
    note: item.note,
    isHi: highlight === item.label,
    bin: colorFor ? colorFor(item) : undefined,
  }));

  // The note sits to the right of the bar, inside the plot, so the reserved margin has to
  // fit the longest one. 6.6px per glyph is measured against Comfortaa at 12px; the clamp
  // stops a long note from eating the bars themselves.
  const longestNote = items.reduce((max, item) => Math.max(max, item.note?.length ?? 0), 0);
  const right = Math.min(260, Math.max(80, Math.round(longestNote * 6.6) + 14));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, items.length * 52 + 20)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right, bottom: 4, left: 4 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke="#dfe4ea" strokeDasharray="3 3" />
        <XAxis
          type="number"
          domain={[0, max ?? "auto"]}
          tickFormatter={(v) => format(Number(v))}
          tick={{ fontSize: 12, fill: "#37404d" }}
          tickLine={false}
          axisLine={{ stroke: "#dfe4ea" }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={170}
          tick={{ fontSize: 13, fill: "#37404d" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value, _name, props) => [
            format(Number(value)),
            (props?.payload as { note?: string })?.note ?? "",
          ]}
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #dfe4ea",
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <Bar dataKey="value" barSize={24} radius={[0, 4, 4, 0]} isAnimationActive>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.bin ?? (d.isHi ? hiFill : fill)}
              fillOpacity={d.bin ? 1 : d.isHi ? 1 : 0.55}
            />
          ))}
          <LabelList
            dataKey={valueLabels ? "value" : "note"}
            position="right"
            content={(props: any) => {
              const { x = 0, y = 0, width = 0, height = 0, value } = props;
              const text = valueLabels && typeof value === "number" ? format(value) : value;
              if (!text) return null;
              return (
                <text
                  x={x + width + 8}
                  y={y + height / 2}
                  fill="#37404d"
                  fontSize={12}
                  dominantBaseline="middle"
                >
                  {text}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}