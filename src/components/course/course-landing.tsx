import Image from "next/image";
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Globe,
  Lock,
  PlayCircle,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import type { CourseLandingData } from "@/lib/data/marketplace";
import { Markdown } from "@/components/shared/markdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDuration } from "@/lib/youtube/url";
import { priceLabel } from "@/lib/money";
import { SOURCE_TYPE_LABEL, sourceTypeOf } from "@/lib/sources/labels";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "C"
  );
}

const SOURCE_ICON = { youtube: PlayCircle, video_upload: PlayCircle, document: FileText, article: Globe, prompt: Sparkles } as const;

/**
 * The course "sales page" shown to people who don't have access yet — on the
 * public share link and inside the dashboard. Shows the outline, never content.
 */
export function CourseLanding({
  data,
  action,
  notice,
}: {
  data: CourseLandingData;
  action: React.ReactNode;
  notice?: React.ReactNode;
}) {
  const { course, modules, totalLessons, creator, learners, hasFinalQuiz } = data;
  const source = sourceTypeOf(course.source_type);
  const SourceIcon = SOURCE_ICON[source];
  const paid = course.price_amount > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        {notice}
        <div className="flex flex-wrap items-center gap-2">
          <span className={paid ? "rounded-full bg-tile-peach px-2.5 py-1 text-[11px] font-medium" : "rounded-full bg-tile-mint px-2.5 py-1 text-[11px] font-medium"}>
            {paid ? "Paid course" : "Free course"}
          </span>
          {course.difficulty && <span className="rounded-full bg-tile-sky px-2.5 py-1 text-[11px] font-medium capitalize">{course.difficulty}</span>}
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
            <SourceIcon className="size-3" /> {source === "prompt" ? "Written with AI" : `From a ${SOURCE_TYPE_LABEL[source].toLowerCase()}`}
          </span>
        </div>
        <h1 className="mt-4 text-3xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">{course.title}</h1>
        {course.subtitle && <p className="mt-2 text-lg text-muted-foreground">{course.subtitle}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <Avatar className="size-11">
              {creator.avatarUrl ? <AvatarImage src={creator.avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-accent text-sm text-primary">{initials(creator.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs text-primary">Created by</p>
              <p className="font-medium">{creator.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4 text-primary" /> {totalLessons} Lessons
            </span>
            {course.estimated_duration ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4 text-primary" /> {formatDuration(course.estimated_duration * 60)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-primary" /> {learners} {learners === 1 ? "learner" : "learners"}
            </span>
          </div>
        </div>

        {course.learning_objectives.length > 0 && (
          <section className="mt-8 rounded-3xl bg-tile-peach p-6">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Target className="size-4" /> What you&apos;ll learn
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {course.learning_objectives.map((o) => (
                <li key={o} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {o}
                </li>
              ))}
            </ul>
          </section>
        )}

        {course.description && (
          <section className="mt-8">
            <h2 className="mb-3 text-xl font-medium">About this course</h2>
            <Markdown>{course.description}</Markdown>
          </section>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-medium">Course outline</h2>
            <span className="text-sm text-muted-foreground">
              {modules.length} modules · {totalLessons} lessons
            </span>
          </div>
          <div className="space-y-3">
            {modules.map((m, mi) => (
              <details key={m.id} open={mi === 0} className="group overflow-hidden rounded-3xl border bg-card">
                <summary className="flex cursor-pointer list-none items-center gap-3.5 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-medium">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{m.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.lessons.length} lessons{m.hasQuiz ? " · quiz" : ""}
                    </span>
                  </span>
                </summary>
                <ul className="border-t px-5 py-2">
                  {m.lessons.map((l, li) => (
                    <li key={l.id} className="flex items-center gap-3 py-2.5 text-sm text-foreground/80">
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="mr-1.5 text-muted-foreground tabular-nums">
                          {mi + 1}.{li + 1}
                        </span>
                        {l.title}
                      </span>
                      {l.minutes ? <span className="text-xs text-muted-foreground">{l.minutes} min</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </div>

      <aside className="rounded-3xl border bg-card p-3 lg:sticky lg:top-6 lg:self-start">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
          {course.thumbnail_url ? (
            <Image src={course.thumbnail_url} alt="" fill sizes="380px" className="object-cover" priority />
          ) : (
            <div className="flex h-full items-center justify-center bg-tile-sky">
              <BookOpen className="size-10 text-foreground/40" />
            </div>
          )}
        </div>
        <div className="px-2 pt-5 pb-2">
          <p className="text-3xl font-medium tracking-tight">{priceLabel(course.price_amount, course.currency)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{paid ? "One-time payment · lifetime access" : "Free forever · no card needed"}</p>
          <div className="mt-5">{action}</div>
          <ul className="mt-5 space-y-2.5 border-t pt-5 text-sm">
            <li className="flex items-center gap-2.5">
              <BookOpen className="size-4 text-primary" /> {totalLessons} detailed lessons
            </li>
            <li className="flex items-center gap-2.5">
              <ClipboardCheck className="size-4 text-primary" /> Module quizzes{hasFinalQuiz ? " & final assessment" : ""}
            </li>
            <li className="flex items-center gap-2.5">
              <Award className="size-4 text-primary" /> Verifiable certificate of completion
            </li>
            {course.difficulty && (
              <li className="flex items-center gap-2.5 capitalize">
                <BarChart3 className="size-4 text-primary" /> {course.difficulty} level
              </li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
