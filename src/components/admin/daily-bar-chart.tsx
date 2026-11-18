"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; value: number };
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Single-series daily bar chart (primary hue, no legend — the card title names the series). */
export function DailyBarChart({ data, unit, prefix = "" }: { data: Point[]; unit: string; prefix?: string }) {
  const fmt = (v: number) => `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: prefix ? 2 : 0 })}`;
  return (
    <div className="h-52" role="img" aria-label={`Daily ${unit}, last ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis tickFormatter={(v) => fmt(Number(v))} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{fmtDay((payload[0].payload as Point).date)}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    <span className="font-medium text-foreground">{fmt(Number(payload[0].value))}</span> {unit}
                  </p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
