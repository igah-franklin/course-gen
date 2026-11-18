import type { Metadata } from "next";
import { requestNow } from "@/lib/utils/time";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCancelJobAction, adminRetryJobAction } from "@/lib/actions/admin";
import { STAGE_LABELS, type StageKey } from "@/lib/jobs/stages";
import { ActionButton } from "@/components/admin/action-button";
import { AdminToolbar, PAGE_SIZE, Pagination } from "@/components/admin/admin-list";
import { PageHeader, ProgressBar, SectionCard, relativeTime } from "@/components/shared/ui-bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Jobs" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_CLS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-accent text-accent-foreground",
  waiting: "bg-accent text-accent-foreground",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default async function AdminJobs({ searchParams }: PageProps<"/admin/jobs">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "all";
  const selected = typeof sp.job === "string" ? sp.job : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createAdminClient();

  let query = db
    .from("course_generation_jobs")
    .select("id, course_id, job_type, status, current_stage, progress, completed_tasks, total_tasks, error_message, created_at, completed_at, slices, courses(title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status === "active") query = query.in("status", ["queued", "running", "waiting"]);
  else if (status !== "all") query = query.eq("status", status);
  const { data: jobs, count } = await query;

  let detail: { tasks: { task_key: string; stage: string; status: string; attempts: number; error: string | null }[]; logs: { id: number; level: string; message: string; created_at: string; data: unknown }[]; cost: number } | null = null;
  if (selected) {
    const [{ data: tasks }, { data: logs }, { data: usage }] = await Promise.all([
      db.from("job_tasks").select("task_key, stage, status, attempts, error").eq("job_id", selected).order("stage").order("position"),
      db.from("job_logs").select("id, level, message, created_at, data").eq("job_id", selected).order("created_at", { ascending: false }).limit(100),
      db.from("ai_usage").select("cost_usd").eq("job_id", selected),
    ]);
    detail = { tasks: tasks ?? [], logs: logs ?? [], cost: (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0) };
  }
  const now = requestNow();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Generation jobs" description="Monitor background course generation and processing failures." />
      <AdminToolbar basePath="/admin/jobs" filters={FILTERS} active={status} search={false} />

      {selected && detail && (
        <SectionCard
          className="mb-6"
          title={`Job ${selected.slice(0, 8)}`}
          description={`Estimated AI cost: $${detail.cost.toFixed(3)}`}
          action={<Link href={`/admin/jobs${status !== "all" ? `?status=${status}` : ""}`} className="text-sm text-primary">Close</Link>}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Tasks ({detail.tasks.length})</p>
              <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
                {detail.tasks.map((t) => (
                  <li key={t.task_key} className="flex items-start gap-2 rounded-md border px-2 py-1.5">
                    <span className={cn("rounded px-1.5 py-0.5", STATUS_CLS[t.status] ?? "bg-muted")}>{t.status}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-mono">{t.task_key.slice(0, 48)}</span>
                      <span className="text-muted-foreground"> · {STAGE_LABELS[t.stage as StageKey] ?? t.stage} · {t.attempts} attempt(s)</span>
                      {t.error && <span className="block text-destructive">{t.error.slice(0, 300)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Logs</p>
              <ul className="max-h-96 space-y-1 overflow-y-auto text-xs">
                {detail.logs.map((l) => (
                  <li key={l.id} className="rounded-md border px-2 py-1.5">
                    <span className={cn("mr-1.5 font-medium", l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : "text-muted-foreground")}>
                      {l.level}
                    </span>
                    {l.message}
                    {l.data ? <span className="block truncate font-mono text-muted-foreground">{JSON.stringify(l.data).slice(0, 200)}</span> : null}
                    <span className="block text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-48">Progress</TableHead>
              <TableHead>Started</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(jobs ?? []).map((j) => {
              const course = j.courses as unknown as { title: string } | null;
              const active = ["queued", "running", "waiting"].includes(j.status);
              return (
                <TableRow key={j.id} className={cn(selected === j.id && "bg-accent/30")}>
                  <TableCell className="max-w-xs">
                    <Link href={`/admin/jobs?job=${j.id}${status !== "all" ? `&status=${status}` : ""}`} className="line-clamp-1 font-medium hover:text-primary">
                      {course?.title ?? j.course_id}
                    </Link>
                    {j.error_message && <p className="line-clamp-2 text-xs text-destructive">{j.error_message}</p>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{j.job_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_CLS[j.status])}>{j.status}</span>
                    {active && j.current_stage && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{STAGE_LABELS[j.current_stage as StageKey]}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProgressBar value={j.progress} size="sm" />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {j.completed_tasks}/{j.total_tasks} tasks · {j.slices} slice(s)
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{relativeTime(j.created_at, now)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {j.status === "failed" && <ActionButton action={adminRetryJobAction.bind(null, j.id)} label="Retry" success="Job requeued" />}
                      {active && (
                        <ActionButton action={adminCancelJobAction.bind(null, j.id)} label="Cancel" success="Cancelled" confirm="Cancel this job?" variant="ghost" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination basePath="/admin/jobs" page={page} pages={Math.ceil((count ?? 0) / PAGE_SIZE)} params={status !== "all" ? { status } : {}} />
    </div>
  );
}
