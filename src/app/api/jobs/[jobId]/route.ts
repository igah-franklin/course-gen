import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isJobRunnable, kickJob } from "@/lib/jobs/runner";
import { isSupabaseConfigured } from "@/lib/env";
import { JOB_STAGES, STAGE_LABELS, type JobType, type StageKey } from "@/lib/jobs/stages";

/** Job status for the progress UI. Also self-heals: a stalled job is resumed. */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[jobId]">) {
  const { jobId } = await ctx.params;
  if (!isSupabaseConfigured()) return Response.json({ error: "Database not configured" }, { status: 503 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // RLS: only the owner (or an admin) can read the job.
  const { data: job } = await supabase
    .from("course_generation_jobs")
    .select("id, course_id, job_type, status, current_stage, progress, total_tasks, completed_tasks, error_message, state, locked_until, next_run_at, started_at, completed_at, created_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: tasks } = await createAdminClient()
    .from("job_tasks")
    .select("stage, status")
    .eq("job_id", jobId);

  const stageKeys = JOB_STAGES[job.job_type as JobType];
  const done = new Set<StageKey>((job.state?.stagesDone ?? []) as StageKey[]);
  const stages = stageKeys.map((key) => {
    const t = (tasks ?? []).filter((x) => x.stage === key);
    const completed = t.filter((x) => x.status === "completed" || x.status === "skipped").length;
    return {
      key,
      label: STAGE_LABELS[key],
      status: done.has(key)
        ? "completed"
        : job.current_stage === key && ["running", "waiting", "queued"].includes(job.status)
          ? "active"
          : job.status === "failed" && job.current_stage === key
            ? "failed"
            : "pending",
      tasksTotal: t.length,
      tasksCompleted: completed,
    };
  });

  if (isJobRunnable(job)) after(() => kickJob(job.id));

  return Response.json(
    {
      id: job.id,
      courseId: job.course_id,
      jobType: job.job_type,
      status: job.status,
      progress: job.progress,
      totalTasks: job.total_tasks,
      completedTasks: job.completed_tasks,
      currentStage: job.current_stage,
      error: job.error_message,
      warnings: job.state?.warnings ?? [],
      stages,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
