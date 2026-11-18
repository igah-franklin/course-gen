import type { Metadata } from "next";
import { requestNow } from "@/lib/utils/time";
import Link from "next/link";
import { AlertTriangle, Award, BookOpen, CheckCircle2, Cpu, DollarSign, Users, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { integrationStatus } from "@/lib/env";
import { DailyBarChart } from "@/components/admin/daily-bar-chart";
import { PageHeader, SectionCard, StatCard, relativeTime } from "@/components/shared/ui-bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Overview" };

function days(n: number, nowMs: number) {
  const out: string[] = [];
  const now = new Date(nowMs);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default async function AdminOverview() {
  await requireAdmin();
  const db = createAdminClient();
  const nowMs = requestNow();
  const since = new Date(nowMs - 29 * 86400_000).toISOString();
  const count = (table: string) => db.from(table).select("*", { count: "exact", head: true });

  const [users, courses, ready, certs, running, failed, usage, errors, jobsRecent] = await Promise.all([
    count("profiles"),
    count("courses"),
    db.from("courses").select("id", { count: "exact", head: true }).in("status", ["ready", "needs_review"]),
    count("certificates"),
    db.from("course_generation_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "waiting"]),
    db.from("course_generation_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
    db.from("ai_usage").select("created_at, operation, model, input_tokens, output_tokens, cost_usd").gte("created_at", since).limit(50000),
    db.from("job_logs").select("id, job_id, message, data, created_at").eq("level", "error").order("created_at", { ascending: false }).limit(8),
    db.from("course_generation_jobs").select("status, created_at").gte("created_at", since),
  ]);

  const usageRows = usage.data ?? [];
  const totalCost = usageRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const totalIn = usageRows.reduce((s, r) => s + r.input_tokens, 0);
  const totalOut = usageRows.reduce((s, r) => s + r.output_tokens, 0);
  const byDay = new Map<string, number>();
  for (const r of usageRows) {
    const k = r.created_at.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + Number(r.cost_usd));
  }
  const costSeries = days(30, nowMs).map((d) => ({ date: d, value: Math.round((byDay.get(d) ?? 0) * 100) / 100 }));
  const byOp = new Map<string, { calls: number; cost: number; tokens: number }>();
  for (const r of usageRows) {
    const cur = byOp.get(r.operation) ?? { calls: 0, cost: 0, tokens: 0 };
    byOp.set(r.operation, { calls: cur.calls + 1, cost: cur.cost + Number(r.cost_usd), tokens: cur.tokens + r.input_tokens + r.output_tokens });
  }
  const jobsByDay = new Map<string, number>();
  for (const j of jobsRecent.data ?? []) jobsByDay.set(j.created_at.slice(0, 10), (jobsByDay.get(j.created_at.slice(0, 10)) ?? 0) + 1);
  const jobSeries = days(30, nowMs).map((d) => ({ date: d, value: jobsByDay.get(d) ?? 0 }));
  const jobsTotal = jobsRecent.data?.length ?? 0;
  const jobsCompleted = (jobsRecent.data ?? []).filter((j) => j.status === "completed").length;
  const now = nowMs;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Platform overview" description="Usage, generation health and AI spend (last 30 days)." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered users" value={users.count ?? 0} icon={Users} />
        <StatCard label="Courses" value={courses.count ?? 0} icon={BookOpen} hint={`${ready.count ?? 0} ready`} />
        <StatCard label="Certificates issued" value={certs.count ?? 0} icon={Award} />
        <StatCard label="AI cost (30d)" value={`$${totalCost.toFixed(2)}`} icon={DollarSign} hint={`${(totalIn / 1e6).toFixed(2)}M in · ${(totalOut / 1e6).toFixed(2)}M out tokens`} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link href="/admin/jobs?status=active" className="rounded-xl border bg-card p-4 shadow-xs hover:border-primary/40">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Cpu className="size-4" /> Jobs in progress</p>
          <p className="mt-2 text-2xl font-semibold">{running.count ?? 0}</p>
        </Link>
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4" /> Success rate (30d)</p>
          <p className="mt-2 text-2xl font-semibold">{jobsTotal ? `${Math.round((jobsCompleted / jobsTotal) * 100)}%` : "—"}</p>
        </div>
        <Link href="/admin/jobs?status=failed" className="rounded-xl border bg-card p-4 shadow-xs hover:border-primary/40">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><XCircle className="size-4" /> Failed jobs (30d)</p>
          <p className="mt-2 text-2xl font-semibold">{failed.count ?? 0}</p>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Estimated AI cost per day" description="USD, from token usage × list prices">
          <DailyBarChart data={costSeries} unit="USD" prefix="$" />
        </SectionCard>
        <SectionCard title="Generation jobs per day">
          <DailyBarChart data={jobSeries} unit="jobs" />
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard title="AI usage by operation" description="Last 30 days">
          {byOp.size ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...byOp.entries()]
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .map(([op, v]) => (
                    <TableRow key={op}>
                      <TableCell className="font-mono text-xs">{op}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">${v.cost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Recent processing failures" action={<Link href="/admin/jobs?status=failed" className="text-sm text-primary">All</Link>}>
          {errors.data?.length ? (
            <ul className="space-y-3">
              {errors.data.map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/jobs?job=${e.job_id}`} className="flex gap-2.5 rounded-lg p-1.5 hover:bg-muted/50">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{e.message}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {String((e.data as { error?: string })?.error ?? "").slice(0, 120)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{relativeTime(e.created_at, now)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No failures. 🎉</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Integrations" description="Configured via environment variables" className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {integrationStatus().map((i) => (
            <li key={i.key} className="flex gap-3 rounded-lg border p-3">
              {i.configured ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${i.required ? "text-destructive" : "text-warning"}`} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {i.label} {!i.required && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
                </p>
                <p className="text-xs text-muted-foreground">{i.purpose}</p>
                {!i.configured && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{i.envVars.join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
