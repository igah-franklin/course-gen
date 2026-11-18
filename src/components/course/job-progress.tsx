"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/shared/ui-bits";
import { cancelJobAction, retryJobAction } from "@/lib/actions/courses";
import { cn } from "@/lib/utils";

type JobStatus = {
  id: string;
  jobType: string;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  progress: number;
  totalTasks: number;
  completedTasks: number;
  currentStage: string | null;
  error: string | null;
  warnings: string[];
  stages: { key: string; label: string; status: "pending" | "active" | "completed" | "failed"; tasksTotal: number; tasksCompleted: number }[];
};

/**
 * Polls real job status. Progress is completed tasks / tasks planned so far —
 * later stages add their tasks once the course structure is known.
 */
export function JobProgress({ jobId, compact = false }: { jobId: string; compact?: boolean }) {
  const router = useRouter();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as JobStatus;
          if (!alive) return;
          setJob(data);
          if (["completed", "failed", "cancelled"].includes(data.status)) {
            router.refresh();
            return;
          }
        }
      } catch {
        /* network blip — try again */
      }
      if (alive) timer = setTimeout(tick, document.hidden ? 15000 : 3000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId, router]);

  if (!job) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading progress…
      </div>
    );
  }

  const active = job.stages.find((s) => s.status === "active");
  const assistant = job.jobType === "assistant_generate";

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        {job.status === "failed" ? <XCircle className="size-4 text-destructive" /> : <Loader2 className="size-4 animate-spin text-primary" />}
        <span className="flex-1">{job.status === "failed" ? job.error : (active?.label ?? "Queued")}</span>
        <span className="tabular-nums text-muted-foreground">{job.progress}%</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {job.status === "failed"
              ? "Generation failed"
              : job.status === "cancelled"
                ? "Generation cancelled"
                : job.status === "completed"
                  ? "Course ready"
                  : job.status === "waiting"
                    ? `${active?.label ?? "Waiting"} — waiting on provider`
                    : assistant
                      ? `${active?.label ?? "Preparing"} — done by your AI assistant`
                      : (active?.label ?? "Queued — starting shortly")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {job.completedTasks} of {job.totalTasks} processing tasks complete
            {job.status !== "completed" && " · more tasks are added as the course structure is determined"}
          </p>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{job.progress}%</span>
      </div>
      <ProgressBar value={job.progress} className="mt-3" />

      <ol className="mt-6 space-y-1">
        {job.stages.map((s) => (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
              s.status === "active" && "bg-accent/60",
            )}
          >
            {s.status === "completed" ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : s.status === "active" ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : s.status === "failed" ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <CircleDashed className="size-4 text-muted-foreground/50" />
            )}
            <span className={cn("flex-1", s.status === "pending" && "text-muted-foreground")}>{s.label}</span>
            {s.tasksTotal > 1 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {s.tasksCompleted}/{s.tasksTotal}
              </span>
            )}
          </li>
        ))}
      </ol>

      {job.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {job.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {w}
            </p>
          ))}
        </div>
      )}

      {job.status === "failed" && (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{job.error}</p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await retryJobAction(job.id);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Resuming from the last completed step");
                  setJob({ ...job, status: "queued", error: null });
                  router.refresh();
                }
              })
            }
          >
            <RotateCcw /> Retry from last completed step
          </Button>
        </div>
      )}

      {["queued", "running", "waiting"].includes(job.status) && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {assistant
              ? "Your assistant does this work in its chat. This page updates as each step is saved."
              : "You can close this page — generation continues in the background."}
          </p>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await cancelJobAction(job.id);
                if (!r.ok) toast.error(r.error);
                else router.refresh();
              })
            }
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
