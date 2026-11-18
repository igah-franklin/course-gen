import type { CourseSourceType } from "@/lib/sources/labels";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Lightbulb,
  ListChecks,
  OctagonAlert,
  PlayCircle,
  Sparkles,
  Target,
  Terminal,
} from "lucide-react";
import type { LessonContent } from "@/lib/ai/schemas";
import { Markdown } from "@/components/shared/markdown";
import { formatTimestamp, timestampUrl } from "@/lib/youtube/url";
import { IllustrationCard, type IllustrationRow } from "./illustration-card";
import { KnowledgeCheck } from "./knowledge-check";
import { cn } from "@/lib/utils";

type Props = {
  lesson: {
    id: string;
    title: string;
    description: string | null;
    content: Partial<LessonContent> & { edited_by_author?: boolean };
    original_timestamp_start: number | null;
    original_timestamp_end: number | null;
    estimated_reading_time: number | null;
    generation_status: string;
    quality_flags: { severity: string; issue: string }[];
  };
  moduleLabel: string;
  illustrations: IllustrationRow[];
  videoId: string | null;
  hasTimestamps: boolean;
  /** Non-YouTube sources: how to point back at the original. */
  source?: { kind: CourseSourceType; title: string | null; url: string | null };
};

function SectionTitle({ icon: Icon, children, id }: { icon: typeof Target; children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-4 flex scroll-mt-24 items-center gap-2.5 text-xl font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      {children}
    </h2>
  );
}

function SourceBadge({ source, fromBrief = false }: { source: "original" | "supplementary"; fromBrief?: boolean }) {
  return source === "original" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
      <PlayCircle className="size-3" /> {fromBrief ? "Core content" : "From the source"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Sparkles className="size-3" /> Supplementary example
    </span>
  );
}

function TimestampLink({ videoId, seconds }: { videoId: string; seconds: number }) {
  return (
    <a
      href={timestampUrl(videoId, seconds)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <Clock className="size-3" /> {formatTimestamp(seconds)}
    </a>
  );
}

export function LessonView({ lesson, moduleLabel, illustrations, videoId: rawVideoId, hasTimestamps: rawHasTimestamps, source }: Props) {
  const videoId = rawVideoId ?? "";
  const hasTimestamps = rawHasTimestamps && Boolean(rawVideoId);
  const c = lesson.content ?? {};
  const start = lesson.original_timestamp_start;
  const end = lesson.original_timestamp_end;

  if (lesson.generation_status !== "generated") {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center">
        <AlertTriangle className="mx-auto size-8 text-warning" />
        <h1 className="mt-4 text-xl font-semibold">{lesson.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {lesson.generation_status === "failed"
            ? "This lesson could not be generated. The course author can regenerate it."
            : "This lesson is still being generated."}
        </p>
        {hasTimestamps && start != null && (
          <a
            href={timestampUrl(videoId, start)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary"
          >
            <PlayCircle className="size-4" /> Watch this part of the original video
          </a>
        )}
      </div>
    );
  }

  const flags = (lesson.quality_flags ?? []).filter((f) => f.severity !== "info" || f.issue);

  return (
    <article className="space-y-14">
      {/* Header */}
      <header>
        <p className="text-sm font-medium text-primary">{moduleLabel}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{lesson.title}</h1>
        {lesson.description && <p className="mt-3 text-lg text-muted-foreground">{lesson.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {lesson.estimated_reading_time ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {lesson.estimated_reading_time} min read
            </span>
          ) : null}
          {hasTimestamps && start != null && (
            <span>
              Video {formatTimestamp(start)}
              {end ? `–${formatTimestamp(end)}` : ""}
            </span>
          )}
          {c.edited_by_author && <span className="rounded-full bg-muted px-2 py-0.5">Edited by author</span>}
        </div>
        {flags.length > 0 && (
          <div className="mt-5 space-y-2">
            {flags.map((f, i) => (
              <p
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                  f.severity === "critical" ? "border-destructive/30 bg-destructive/5" : "border-warning/40 bg-warning/5",
                )}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /> {f.issue}
              </p>
            ))}
          </div>
        )}
      </header>

      {/* A. Introduction */}
      {(c.introduction || (c.learning_objectives?.length ?? 0) > 0) && (
        <section>
          <SectionTitle icon={Target} id="introduction">
            What you&apos;ll learn
          </SectionTitle>
          {c.introduction && <Markdown>{c.introduction}</Markdown>}
          {c.learning_objectives && c.learning_objectives.length > 0 && (
            <ul className="mt-5 grid gap-2.5 rounded-xl border bg-accent/30 p-5 sm:grid-cols-2">
              {c.learning_objectives.map((o) => (
                <li key={o} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {o}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* B. Detailed explanation */}
      {c.explanation_sections && c.explanation_sections.length > 0 && (
        <section>
          <SectionTitle icon={Lightbulb} id="explanation">
            Detailed explanation
          </SectionTitle>
          <div className="space-y-8">
            {c.explanation_sections.map((s, i) => (
              <div key={i}>
                <h3 className="mb-2 text-lg font-semibold">{s.heading}</h3>
                <Markdown>{s.body}</Markdown>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* C. Step-by-step */}
      {c.steps && c.steps.length > 0 && (
        <section>
          <SectionTitle icon={ListChecks} id="steps">
            Step-by-step instructions
          </SectionTitle>
          <ol className="relative space-y-4 before:absolute before:top-4 before:bottom-4 before:left-[15px] before:w-px before:bg-border">
            {c.steps.map((s, i) => (
              <li key={i} className="relative flex gap-4">
                <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-4 ring-background">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 rounded-xl border bg-card p-4 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">
                      Step {i + 1}: {s.title}
                    </h3>
                    {hasTimestamps && s.timestamp_seconds != null && <TimestampLink videoId={videoId} seconds={s.timestamp_seconds} />}
                  </div>
                  <Markdown className="mt-1 text-[15px]">{s.instruction}</Markdown>
                  {s.command && (
                    <div className="mt-3 overflow-hidden rounded-lg border">
                      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                        <Terminal className="size-3" /> Run / type
                      </div>
                      <pre className="overflow-x-auto bg-[oklch(0.2_0.02_265)] p-3 font-mono text-[13px] text-[oklch(0.93_0.01_265)]">
                        {s.command}
                      </pre>
                    </div>
                  )}
                  {s.expected_result && (
                    <p className="mt-3 flex gap-2 rounded-lg bg-success/5 px-3 py-2 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        <span className="font-medium">Expected result: </span>
                        {s.expected_result}
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* D. Illustrations */}
      {illustrations.length > 0 && (
        <section>
          <SectionTitle icon={Eye} id="illustrations">
            Illustrations &amp; visual explanations
          </SectionTitle>
          <div className="space-y-6">
            {illustrations.map((ill, i) => (
              <IllustrationCard key={ill.id} ill={ill} videoId={rawVideoId} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Visual gaps */}
      {c.visual_gaps && c.visual_gaps.length > 0 && (
        <section className="rounded-xl border border-warning/40 bg-warning/5 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="size-4 text-warning" /> Shown on screen in the video
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The original video shows these on screen, and the transcript doesn&apos;t fully describe them. Watch the referenced part for the visual details.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {c.visual_gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {/* E. Practical examples */}
      {((c.examples?.length ?? 0) > 0 || (c.code_examples?.length ?? 0) > 0) && (
        <section>
          <SectionTitle icon={Sparkles} id="examples">
            Practical examples
          </SectionTitle>
          <div className="space-y-5">
            {c.examples?.map((e, i) => (
              <div key={`e${i}`} className="rounded-xl border bg-card p-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{e.title}</h3>
                  <div className="flex items-center gap-2">
                    <SourceBadge source={e.source} fromBrief={source?.kind === "prompt"} />
                    {hasTimestamps && e.timestamp_seconds != null && <TimestampLink videoId={videoId} seconds={e.timestamp_seconds} />}
                  </div>
                </div>
                <Markdown className="mt-2">{e.body}</Markdown>
              </div>
            ))}
            {c.code_examples?.map((e, i) => (
              <div key={`c${i}`} className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
                  <h3 className="font-semibold">{e.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{e.language}</span>
                    <SourceBadge source={e.source} fromBrief={source?.kind === "prompt"} />
                  </div>
                </div>
                <pre className="overflow-x-auto bg-[oklch(0.2_0.02_265)] p-4 font-mono text-[13px] leading-6 text-[oklch(0.93_0.01_265)]">
                  {e.code}
                </pre>
                <Markdown className="px-5 py-4 text-sm">{e.explanation}</Markdown>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* F. Common mistakes */}
      {c.common_mistakes && c.common_mistakes.length > 0 && (
        <section>
          <SectionTitle icon={OctagonAlert} id="mistakes">
            Common mistakes
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {c.common_mistakes.map((m, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="flex gap-2 text-sm font-medium">
                  <OctagonAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> {m.mistake}
                </p>
                <p className="mt-2 pl-6 text-sm text-muted-foreground">{m.how_to_avoid}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* G. Key takeaways */}
      {c.key_takeaways && c.key_takeaways.length > 0 && (
        <section className="rounded-2xl border bg-accent/30 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-primary" /> Key takeaways
          </h2>
          <ul className="mt-4 space-y-2.5">
            {c.key_takeaways.map((t) => (
              <li key={t} className="flex gap-2.5 text-[15px]">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" /> {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* H. Knowledge check */}
      {c.knowledge_check && c.knowledge_check.length > 0 && (
        <section>
          <SectionTitle icon={ListChecks} id="check">
            Knowledge check
          </SectionTitle>
          <KnowledgeCheck items={c.knowledge_check} />
        </section>
      )}

      {/* I. Original source reference */}
      {rawVideoId ? (
        <section className="flex flex-col items-start gap-4 rounded-3xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">Original video reference</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasTimestamps && start != null
                ? `This lesson covers ${formatTimestamp(start)}${end ? `–${formatTimestamp(end)}` : ""} of the original video.`
                : "Open the original video for the full visual context."}
            </p>
          </div>
          <a
            href={timestampUrl(videoId, hasTimestamps ? start : 0)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#FF0000] px-4 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110"
          >
            <PlayCircle className="size-4" /> Watch This Part of the Original Video
          </a>
        </section>
      ) : source?.kind === "article" && source.url ? (
        <section className="flex flex-col items-start gap-4 rounded-3xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">Original article</h2>
            <p className="mt-1 text-sm text-muted-foreground">{source.title ?? "Read the source article for full context."}</p>
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-ink-foreground transition-all hover:bg-ink/85"
          >
            Read the Original Article
          </a>
        </section>
      ) : null}
    </article>
  );
}
