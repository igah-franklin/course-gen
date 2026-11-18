"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

type Point = { date: string; minutes: number; lessons: number };
const RANGES = [
  { key: 14, label: "14 days" },
  { key: 30, label: "30 days" },
  { key: 90, label: "90 days" },
] as const;

function fillDays(data: Point[], days: number): Point[] {
  const map = new Map(data.map((d) => [d.date, d]));
  const out: Point[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) ?? { date: key, minutes: 0, lessons: 0 });
  }
  return out;
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Single-series daily learning minutes. Hue = primary; no legend (title names it). */
export function ActivityChart({ data }: { data: Point[] }) {
  const [range, setRange] = useState<14 | 30 | 90>(30);
  const series = useMemo(() => fillDays(data, range), [data, range]);
  const total = series.reduce((s, d) => s + d.minutes, 0);
  const activeDays = series.filter((d) => d.minutes > 0).length;
  const streak = useMemo(() => {
    let s = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].minutes > 0) s++;
      else if (i === series.length - 1) continue; // today may not have activity yet
      else break;
    }
    return s;
  }, [series]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-6">
          <Stat label="Minutes learned" value={total.toLocaleString()} />
          <Stat label="Active days" value={`${activeDays}/${range}`} />
          <Stat label="Current streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
        </div>
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                range === r.key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 h-48" role="img" aria-label={`Daily learning minutes over the last ${range} days, ${total} minutes total`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 0, left: -24, bottom: 0 }} barCategoryGap={range > 30 ? 1 : 3}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium text-foreground">{fmtDay(p.date)}</p>
                    <p className="mt-1 text-muted-foreground">
                      <span className="font-medium text-foreground">{p.minutes}</span> min ·{" "}
                      <span className="font-medium text-foreground">{p.lessons}</span> lessons completed
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="minutes" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
