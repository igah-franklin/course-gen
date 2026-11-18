import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";
import { getAiProvider, AiRateLimitError, AiNotConfiguredError, type AiProvider } from "@/lib/ai/provider";
import { RetryableError } from "@/lib/transcript/providers";
import { VideoNotFoundError } from "@/lib/youtube/metadata";
import { FatalJobError, planStage, runTask, type Ctx, type JobRow, type TaskRow } from "./pipeline";
import {
  ASSISTANT_JOB,
  CRITICAL_STAGES,
  JOB_STAGES,
  MAX_TASK_ATTEMPTS,
  STAGE_CONCURRENCY,
  STAGE_LABELS,
} from "./stages";

/** Platform limit for one slice invocation (seconds); see /api/jobs/run maxDuration. */
export const SLICE_MAX_DURATION = 800;
const LEASE_SECONDS = SLICE_MAX_DURATION + 60;
/** Don't start a new batch of tasks with less than this much budget left (ms). */
const MIN_BATCH_BUDGET_MS = 20_000;

type SliceResult = { claimed: boolean; done: boolean; needsMore: boolean; delaySeconds?: number };

/**
 * Executes one bounded "slice" of a job. All state lives in Postgres, so any
 * slice can crash and a later slice (cron, poll or self-continuation) resumes
 * from the last completed task. Leases make concurrent slices impossible.
 */
export async function runJobSlice(jobId: string): Promise<SliceResult> {
  const db = createAdminClient();
  const { data: claimed, error } = await db.rpc("claim_job", { p_job_id: jobId, p_lease_seconds: LEASE_SECONDS });
  if (error) throw error;
  const jobRow = (claimed as JobRow[] | null)?.[0];
  if (!jobRow) return { claimed: false, done: false, needsMore: false };

  const started = Date.now();
  const budgetMs = serverEnv.jobSliceSeconds * 1000;
  const job: JobRow = { ...jobRow, state: jobRow.state ?? {} };
  job.state.stagesDone ??= [];
  job.state.planned ??= [];

  let providerPromise: Promise<AiProvider> | null = null;
  const ctx: Ctx = {
    job,
    db,
    memo: new Map(),
    ai: () => (providerPromise ??= getAiProvider()),
    log: async (level, message, data) => {
      await db.from("job_logs").insert({ job_id: job.id, level, message, data: data ?? null });
      if (level === "error") console.error(`[job ${job.id}] ${message}`, data ?? "");
    },
  };

  const stages = JOB_STAGES[job.job_type];
  let outcome: { status?: string; nextRunInSeconds?: number; error?: string } = {};

  try {
    // Any task left "running" belongs to a crashed slice — we hold the lease now.
    await db.from("job_tasks").update({ status: "pending" }).eq("job_id", job.id).eq("status", "running");

    while (Date.now() - started < budgetMs - MIN_BATCH_BUDGET_MS) {
      const { data: fresh } = await db.from("course_generation_jobs").select("status").eq("id", job.id).single();
      if (fresh?.status === "cancelled") {
        outcome = { status: "cancelled" };
        break;
      }

      const stage = stages.find((s) => !job.state.stagesDone!.includes(s));
      if (!stage) {
        outcome = { status: "completed" };
        break;
      }

      if (!job.state.planned!.includes(stage)) {
        const specs = await planStage(stage, ctx);
        if (specs.length) {
          const { error: perr } = await db.from("job_tasks").upsert(
            specs.map((s, i) => ({
              job_id: job.id,
              stage,
              task_key: s.key,
              payload: s.payload ?? {},
              position: s.position ?? i,
            })),
            { onConflict: "job_id,task_key", ignoreDuplicates: true },
          );
          if (perr) throw perr;
        }
        job.state.planned!.push(stage);
        await saveJob(job, { current_stage: stage });
        await ctx.log("info", `Stage started: ${STAGE_LABELS[stage]} (${specs.length} task${specs.length === 1 ? "" : "s"})`);
      }

      const { data: taskData, error: terr } = await db
        .from("job_tasks")
        .select("*")
        .eq("job_id", job.id)
        .eq("stage", stage)
        .order("position");
      if (terr) throw terr;
      const tasks = (taskData ?? []) as TaskRow[];

      // Tasks that exhausted their retries.
      const exhausted = tasks.filter((t) => t.status === "failed" && t.attempts >= MAX_TASK_ATTEMPTS);
      if (exhausted.length) {
        if (CRITICAL_STAGES.includes(stage)) {
          throw new FatalJobError(exhausted[0].error ?? `${STAGE_LABELS[stage]} failed`);
        }
        for (const t of exhausted) {
          await db.from("job_tasks").update({ status: "skipped" }).eq("id", t.id);
          job.state.warnings = [
            ...(job.state.warnings ?? []),
            `${STAGE_LABELS[stage]}: one item could not be generated after ${MAX_TASK_ATTEMPTS} attempts (${t.error ?? "unknown error"}).`,
          ];
          if (stage === "lessons") {
            await db.from("lessons").update({ generation_status: "failed" }).eq("id", String(t.payload.lessonId));
          }
        }
        continue;
      }

      const waiting = tasks.filter((t) => t.status === "waiting");
      const runnable = tasks.filter((t) => t.status === "pending" || (t.status === "failed" && t.attempts < MAX_TASK_ATTEMPTS));
      if (!runnable.length && !waiting.length) {
        job.state.stagesDone!.push(stage);
        await saveJob(job, {});
        await ctx.log("info", `Stage completed: ${STAGE_LABELS[stage]}`);
        continue;
      }

      // Waiting tasks (e.g. async transcription) are re-checked when due.
      const dueWaiting = waiting.filter((t) => {
        const at = Number((t.payload as { retryAt?: number }).retryAt ?? 0);
        return at <= Date.now();
      });
      const batch = [...dueWaiting, ...runnable].slice(0, STAGE_CONCURRENCY[stage]);
      if (!batch.length) {
        const nextAt = Math.min(...waiting.map((t) => Number((t.payload as { retryAt?: number }).retryAt ?? Date.now())));
        outcome = { status: "waiting", nextRunInSeconds: Math.max(5, Math.ceil((nextAt - Date.now()) / 1000)) };
        break;
      }

      let rateLimitedFor = 0;
      const settled = await Promise.allSettled(
        batch.map(async (task) => {
          await db
            .from("job_tasks")
            .update({ status: "running", attempts: task.attempts + 1, started_at: new Date().toISOString(), error: null })
            .eq("id", task.id);
          try {
            const res = await runTask(task, ctx);
            if (res.status === "waiting") {
              await db
                .from("job_tasks")
                .update({
                  status: "waiting",
                  attempts: task.attempts, // waiting is not a failed attempt
                  result: res.result ?? null,
                  payload: { ...task.payload, retryAt: Date.now() + res.retryAfterSeconds * 1000 },
                })
                .eq("id", task.id);
            } else {
              await db
                .from("job_tasks")
                .update({ status: res.status, result: res.result ?? null })
                .eq("id", task.id);
            }
          } catch (err) {
            if (err instanceof FatalJobError || err instanceof AiNotConfiguredError || err instanceof VideoNotFoundError) {
              await db.from("job_tasks").update({ status: "failed", error: err.message, attempts: MAX_TASK_ATTEMPTS }).eq("id", task.id);
              throw err;
            }
            const message = err instanceof Error ? err.message : String(err);
            if (err instanceof AiRateLimitError || err instanceof RetryableError) {
              const wait = err instanceof AiRateLimitError ? err.retryAfterSeconds : err.retryAfterSeconds;
              rateLimitedFor = Math.max(rateLimitedFor, wait);
              // Rate limits don't consume an attempt.
              await db.from("job_tasks").update({ status: "pending", attempts: task.attempts, error: message }).eq("id", task.id);
              await ctx.log("warn", `Rate limited on ${task.task_key}; backing off ${wait}s`);
              return;
            }
            await db.from("job_tasks").update({ status: "failed", error: message.slice(0, 2000) }).eq("id", task.id);
            await ctx.log("error", `Task ${task.task_key} failed (attempt ${task.attempts + 1})`, { error: message });
          }
        }),
      );
      await saveJob(job, {});
      await updateProgress(job.id);
      const fatal = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (fatal) throw fatal.reason;
      if (rateLimitedFor > 0) {
        outcome = { status: "running", nextRunInSeconds: rateLimitedFor };
        break;
      }
    }
  } catch (err) {
    const message =
      err instanceof FatalJobError || err instanceof AiNotConfiguredError || err instanceof VideoNotFoundError
        ? err.message
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    await ctx.log("error", "Job failed", { error: message });
    outcome = { status: "failed", error: message };
  }

  // ---- Release lease and record outcome.
  const now = new Date();
  if (outcome.status === "completed") {
    await saveJob(job, {
      status: "completed",
      progress: 100,
      completed_at: now.toISOString(),
      locked_until: null,
      current_stage: "save",
    });
    await updateProgress(job.id, true);
    return { claimed: true, done: true, needsMore: false };
  }
  if (outcome.status === "failed") {
    await saveJob(job, { status: "failed", error_message: outcome.error, locked_until: null, completed_at: now.toISOString() });
    if (job.job_type === "generate_course") {
      await db.from("courses").update({ status: "failed" }).eq("id", job.course_id);
    }
    return { claimed: true, done: true, needsMore: false };
  }
  if (outcome.status === "cancelled") {
    await saveJob(job, { locked_until: null, completed_at: now.toISOString() });
    return { claimed: true, done: true, needsMore: false };
  }

  const delay = outcome.nextRunInSeconds ?? 0;
  await saveJob(job, {
    status: outcome.status === "waiting" ? "waiting" : "running",
    locked_until: null,
    next_run_at: new Date(now.getTime() + delay * 1000).toISOString(),
  });
  return { claimed: true, done: false, needsMore: true, delaySeconds: delay };
}

async function saveJob(job: JobRow, patch: Record<string, unknown>) {
  const db = createAdminClient();
  await db
    .from("course_generation_jobs")
    .update({ state: job.state, ...patch })
    .eq("id", job.id);
}

/** Progress = completed tasks / tasks planned so far. Never estimated. */
export async function updateProgress(jobId: string, done = false) {
  const db = createAdminClient();
  const { data } = await db.from("job_tasks").select("status").eq("job_id", jobId);
  const total = data?.length ?? 0;
  const completed = (data ?? []).filter((t) => t.status === "completed" || t.status === "skipped").length;
  const progress = done ? 100 : total ? Math.min(99, Math.floor((completed / total) * 100)) : 0;
  await db
    .from("course_generation_jobs")
    .update({ total_tasks: total, completed_tasks: completed, progress })
    .eq("id", jobId);
}

/* ============================================================================
 * Dispatch: start a slice in a fresh invocation.
 * ==========================================================================*/

/**
 * Triggers a new slice via the internal run endpoint. Returns quickly; the
 * endpoint does the work after responding. Falls back to running inline when
 * no runner secret is configured (single-process self-hosting).
 */
export async function kickJob(jobId: string): Promise<void> {
  if (!serverEnv.jobRunnerSecret) {
    const r = await runJobSlice(jobId).catch((e) => {
      console.error("[jobs] inline slice failed", e);
      return null;
    });
    if (!r?.needsMore) return;
    if (r.delaySeconds && r.delaySeconds > 90) return;
    if (r.delaySeconds) await new Promise((res) => setTimeout(res, r.delaySeconds! * 1000));
    await kickJob(jobId);
    return;
  }
  try {
    await fetch(`${publicEnv.siteUrl}/api/jobs/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.jobRunnerSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (e) {
    // The recovery cron and status polling will pick the job up.
    console.error("[jobs] kick failed", e);
  }
}

/** Jobs that are runnable but have no active slice (crashed, delayed, or never started). */
export async function findStalledJobs(limit = 10) {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("course_generation_jobs")
    .select("id")
    .in("status", ["queued", "running", "waiting"])
    .neq("job_type", ASSISTANT_JOB)
    .lte("next_run_at", nowIso)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order("next_run_at")
    .limit(limit);
  return (data ?? []).map((j) => j.id as string);
}

export function isJobRunnable(job: { job_type: string; status: string; locked_until: string | null; next_run_at: string }) {
  const now = Date.now();
  return (
    job.job_type !== ASSISTANT_JOB &&
    ["queued", "running", "waiting"].includes(job.status) &&
    new Date(job.next_run_at).getTime() <= now &&
    (!job.locked_until || new Date(job.locked_until).getTime() < now)
  );
}
