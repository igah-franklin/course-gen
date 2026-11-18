import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Plug,
  Layers,
  PlayCircle,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCourseOutline } from "@/lib/data/learner";
import { getCachedCommunityLinks } from "@/lib/settings-cached";
import { formatDuration, formatTimestamp, timestampUrl } from "@/lib/youtube/url";
import { JobProgress } from "@/components/course/job-progress";
import { CourseOwnerActions } from "@/components/course/course-owner-actions";
import { CommunityButtons } from "@/components/shared/community-buttons";
import { CopyField } from "@/components/shared/copy-field";
import { publicEnv } from "@/lib/env";
import { Markdown } from "@/components/shared/markdown";
import { CourseStatusBadge, ProgressBar, SectionCard } from "@/components/shared/ui-bits";
import { buttonVariants } from "@/components/ui/button";
import { YouTubeIcon } from "@/components/brand/brand-icons";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Course" };

type QualityReport = {
  teaching_points?: number;
  covered_points?: number;
  coverage_ratio?: number;
  passed?: boolean;
  uncovered?: { id: string; title: string; start_seconds: number | null }[];
  visual_dependent_points?: number;
  ai_review?: { overall_score: number; checks: { check: string; passed: boolean; notes: string }[] };
};
type Coverage = {
  transcript_source?: string;
  coverage_ratio?: number | null;
  has_timestamps?: boolean;
  visual_analysis?: string;
  transcript_seconds?: number;
};

const SOURCE_LABEL: Record<string, string> = {
  captions: "Video captions",
  ai_transcription: "AI transcription of the audio",
  media_upload: "Transcription of uploaded recording",
  manual: "Uploaded transcript",
};

export default async function CoursePage({ params }: PageProps<"/dashboard/courses/[courseId]">) {
  const { courseId } = await params;
  const user = await requireUser(`/dashboard/courses/${courseId}`);
  const outline = await getCourseOutline(courseId, user.id);
  if (!outline) notFound();
  const { course, modules, isOwner, latestJob } = outline;
  const links = await getCachedCommunityLinks();

  const generating = latestJob && ["queued", "running", "waiting"].includes(latestJob.status);
  const isMainJob = latestJob?.job_type === "generate_course" || latestJob?.job_type === "assistant_generate";
  const assistantJob = latestJob?.job_type === "assistant_generate";
  const ready = ["ready", "needs_review"].includes(course.status);
  const warnings = (course.processing_warnings ?? []) as string[];
  const report = (course.quality_report ?? {}) as QualityReport;
  const coverage = (course.coverage ?? {}) as Coverage;
  const resumeLessonId = outline.enrollment?.last_lesson_id ?? outline.lessons.find((l) => !l.completed)?.id;
  const objectives = (course.learning_objectives ?? []) as string[];
  const prerequisites = (course.prerequisites ?? []) as string[];

  // ---- Generation in progress / failed
  if (!ready && latestJob && isMainJob) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-start gap-4">
          {course.thumbnail_url && (
            <div className="relative hidden aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-muted sm:block">
              <Image src={course.thumbnail_url} alt="" fill sizes="160px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0">
            <CourseStatusBadge status={course.status} />
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{course.original_video_title ?? course.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.channel_name}
              {course.video_duration ? ` · ${formatDuration(course.video_duration)}` : ""}
            </p>
          </div>
        </div>
        {generating && assistantJob && (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-accent/40 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Plug className="size-4 text-primary" /> Your AI assistant is writing this course
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Open Claude or ChatGPT (with the {publicEnv.appName} connector enabled) and paste this. Progress below updates live as
              your assistant works; you can resume in any new chat.
            </p>
            <CopyField
              multiline
              className="mt-4 bg-background"
              value={`Continue generating my ${publicEnv.appName} course "${course.original_video_title ?? course.title}" (course id ${course.id}) — call get_next_step and keep completing each task until it's done.`}
            />
            <Link href="/dashboard/connect" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Not connected yet? Set up the connector →
            </Link>
          </div>
        )}
        <SectionCard
          title={generating ? "Building your course" : "Course generation"}
          description={generating ? "We're analysing the entire video. Real progress, updated live." : undefined}
        >
          <JobProgress jobId={latestJob.id} />
        </SectionCard>
        {isOwner && !generating && (
          <div className="mt-4 flex justify-end">
            <CourseOwnerActions courseId={course.id} title={course.title} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CourseStatusBadge status={course.status} />
            {course.difficulty && (
              <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize">{course.difficulty}</span>
            )}
            {course.is_public && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                <Globe className="size-3" /> Public
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">{course.title}</h1>
          {course.subtitle && <p className="mt-2 text-lg text-muted-foreground">{course.subtitle}</p>}
          <a
            href={course.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <YouTubeIcon className="size-4 text-[#FF0000]" />
            {course.original_video_title} · {course.channel_name}
            <ExternalLink className="size-3.5" />
          </a>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Layers, label: "Modules", value: modules.length },
              { icon: BookOpen, label: "Lessons", value: outline.lessons.length },
              { icon: Clock, label: "Est. time", value: course.estimated_duration ? formatDuration(course.estimated_duration * 60) : "—" },
              { icon: PlayCircle, label: "Source video", value: formatDuration(course.video_duration) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-3 shadow-xs">
                <s.icon className="size-4 text-primary" />
                <p className="mt-2 text-sm font-semibold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Progress card */}
        <aside className="rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
          {course.thumbnail_url && (
            <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
              <Image src={course.thumbnail_url} alt="" fill sizes="360px" className="object-cover" priority />
            </div>
          )}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {outline.completedLessons}/{outline.totalLessons} lessons
            </span>
            <span className="font-semibold tabular-nums">{outline.progress}%</span>
          </div>
          <ProgressBar value={outline.progress} className="mt-2" />
          <div className="mt-4 flex gap-2">
            <Link
              href={`/dashboard/courses/${course.id}/learn${resumeLessonId ? `?lesson=${resumeLessonId}` : ""}`}
              className={cn(buttonVariants({ size: "lg" }), "h-10 flex-1")}
            >
              <PlayCircle />
              {outline.completedLessons > 0 ? "Continue Learning" : "Start Course"}
            </Link>
            {isOwner && <CourseOwnerActions courseId={course.id} title={course.title} />}
          </div>
          {outline.finalQuiz && (
            <Link
              href={`/dashboard/courses/${course.id}/learn?quiz=${outline.finalQuiz.id}`}
              className="mt-3 flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" /> Final assessment
              </span>
              <span className="text-xs text-muted-foreground">
                {outline.finalQuiz.passed ? `Passed · ${Math.round(outline.finalQuiz.best)}%` : `Pass mark ${outline.finalQuiz.passing_score}%`}
              </span>
            </Link>
          )}
          {outline.certificate ? (
            <Link
              href="/dashboard/certificates"
              className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm font-medium text-success"
            >
              <Award className="size-4" /> Certificate earned — view
            </Link>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Award className="size-3.5" /> Complete all lessons
              {outline.finalQuiz ? " and pass the final assessment" : ""} to earn your certificate.
            </p>
          )}
        </aside>
      </div>

      {generating && !isMainJob && latestJob && (
        <div className="mt-6 rounded-xl border bg-card p-4 shadow-xs">
          <p className="mb-2 text-sm font-medium">
            {latestJob.job_type === "regenerate_lesson" ? "Regenerating a lesson" : "Regenerating illustrations"}
          </p>
          <JobProgress jobId={latestJob.id} compact />
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-8 space-y-2">
          {warnings.map((w) => (
            <div key={w} className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          {course.description && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">About this course</h2>
              <Markdown>{course.description}</Markdown>
            </section>
          )}

          {objectives.length > 0 && (
            <section className="rounded-2xl border bg-card p-6 shadow-xs">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Target className="size-4 text-primary" /> What you&apos;ll learn
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {objectives.map((o) => (
                  <li key={o} className="flex gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {o}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-4 text-lg font-semibold">Curriculum</h2>
            <div className="space-y-3">
              {modules.map((m, mi) => (
                <details key={m.id} open={mi === 0} className="group overflow-hidden rounded-xl border bg-card shadow-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 marker:hidden">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
                        m.completed ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      {m.completed ? <CheckCircle2 className="size-4" /> : mi + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{m.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {m.lessons.length} lessons
                        {m.quiz ? " · quiz" : ""}
                      </span>
                    </span>
                  </summary>
                  <div className="border-t">
                    {m.description && <p className="px-5 pt-3 text-sm text-muted-foreground">{m.description}</p>}
                    <ul className="divide-y">
                      {m.lessons.map((l, li) => (
                        <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                          {l.completed ? (
                            <CheckCircle2 className="size-4 shrink-0 text-primary" />
                          ) : (
                            <FileText className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <Link
                            href={`/dashboard/courses/${course.id}/learn?lesson=${l.id}`}
                            className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                          >
                            {mi + 1}.{li + 1} {l.title}
                          </Link>
                          {l.generation_status === "failed" && (
                            <span className="text-[11px] font-medium text-destructive">Generation failed</span>
                          )}
                          {(l.quality_flags as unknown[])?.length > 0 && l.generation_status !== "failed" && (
                            <AlertTriangle className="size-3.5 text-warning" aria-label="Has review notes" />
                          )}
                          {l.original_timestamp_start != null && coverage.has_timestamps !== false && (
                            <a
                              href={timestampUrl(course.youtube_video_id, l.original_timestamp_start)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hidden text-xs tabular-nums text-muted-foreground hover:text-foreground sm:inline"
                            >
                              {formatTimestamp(l.original_timestamp_start)}
                            </a>
                          )}
                          {l.estimated_reading_time ? (
                            <span className="hidden text-xs text-muted-foreground sm:inline">{l.estimated_reading_time} min</span>
                          ) : null}
                        </li>
                      ))}
                      {m.quiz && (
                        <li className="flex items-center gap-3 bg-muted/30 px-5 py-3">
                          <ClipboardCheck className={cn("size-4", m.quiz.passed ? "text-primary" : "text-muted-foreground")} />
                          <Link href={`/dashboard/courses/${course.id}/learn?quiz=${m.quiz.id}`} className="flex-1 text-sm hover:text-primary">
                            {m.quiz.title}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {m.quiz.attempts ? `Best ${Math.round(m.quiz.best)}%` : `Pass ${m.quiz.passing_score}%`}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {(prerequisites.length > 0 || course.target_audience) && (
            <SectionCard title="Before you start">
              {course.target_audience && (
                <div className="mb-4">
                  <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <Users className="size-3.5" /> Who it&apos;s for
                  </p>
                  <p className="mt-1.5 text-sm">{course.target_audience}</p>
                </div>
              )}
              {prerequisites.length > 0 && (
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prerequisites</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                    {prerequisites.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="How this course was made" description="What was actually analysed">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Written by</dt>
                <dd className="text-right">{course.generation_engine === "assistant" ? "Your AI assistant (via connector)" : `${publicEnv.appName} AI`}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="text-right">{SOURCE_LABEL[coverage.transcript_source ?? ""] ?? "Transcript"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Transcript coverage</dt>
                <dd>{coverage.coverage_ratio != null ? `${Math.round(coverage.coverage_ratio * 100)}% of video` : "Unknown duration"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">On-screen visuals</dt>
                <dd className="text-right">
                  {coverage.visual_analysis === "transcript_and_user_frames" ? "Your screenshots analysed" : "Not analysed (transcript only)"}
                </dd>
              </div>
              {report.teaching_points != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Teaching points covered</dt>
                  <dd className="tabular-nums">
                    {report.covered_points}/{report.teaching_points}
                  </dd>
                </div>
              )}
              {report.ai_review && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Quality review score</dt>
                  <dd className="tabular-nums">{Math.round(report.ai_review.overall_score)}/100</dd>
                </div>
              )}
            </dl>
            {report.ai_review && (
              <details className="mt-4 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-primary">
                  <ShieldCheck className="size-3.5" /> View quality checks
                </summary>
                <ul className="mt-3 space-y-2">
                  {report.ai_review.checks.map((c) => (
                    <li key={c.check} className="flex gap-2 text-xs">
                      {c.passed ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      )}
                      <span>
                        <span className="font-medium capitalize">{c.check.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground"> — {c.notes}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {report.uncovered && report.uncovered.length > 0 && (
                  <div className="mt-3 rounded-lg bg-warning/5 p-3 text-xs">
                    <p className="font-medium">Possibly not fully covered:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {report.uncovered.slice(0, 10).map((u) => (
                        <li key={u.id}>
                          {u.title}
                          {u.start_seconds != null && (
                            <a
                              className="ml-1 text-primary"
                              target="_blank"
                              rel="noopener noreferrer"
                              href={timestampUrl(course.youtube_video_id, u.start_seconds)}
                            >
                              ({formatTimestamp(u.start_seconds)})
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </details>
            )}
          </SectionCard>

          <SectionCard title="Learning community" description="Stuck on something? Ask other learners.">
            <CommunityButtons links={links} size="sm" compactLabels />
          </SectionCard>

          {isOwner && (
            <Link
              href={`/dashboard/courses/${course.id}/edit`}
              className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs transition-colors hover:border-primary/40"
            >
              <BarChart3 className="size-4 text-primary" /> Edit course, lessons & completion rules
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
