import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, Clock, FileText, PlayCircle } from "lucide-react";
import type { CourseCard as CourseCardData } from "@/lib/data/learner";
import { CourseStatusBadge, ProgressBar, relativeTime } from "@/components/shared/ui-bits";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration } from "@/lib/youtube/url";
import { cn } from "@/lib/utils";

export function CourseCard({ course, now }: { course: CourseCardData; now: number }) {
  const ready = course.status === "ready" || course.status === "needs_review";
  const started = course.completedLessons > 0;
  const source =
    course.originalVideoTitle && course.originalVideoTitle !== course.title
      ? `From: ${course.originalVideoTitle}`
      : (course.subtitle ?? course.channelName);

  return (
    <div className="group flex flex-col rounded-3xl border bg-card p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_oklch(0.3_0.03_40/0.35)]">
      <Link href={`/dashboard/courses/${course.id}`} className="relative block aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
        {course.thumbnailUrl ? (
          <Image
            src={course.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <BookOpen className="size-8" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <CourseStatusBadge status={course.status} className="shadow-sm" />
        </div>
        {ready && (
          <span className="absolute right-3 bottom-3 rounded-xl bg-card px-3 py-1.5 text-sm font-medium tabular-nums shadow-sm">
            {course.progress}%
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col px-3 pt-4 pb-2">
        <Link href={`/dashboard/courses/${course.id}`} className="line-clamp-2 text-lg leading-snug font-medium hover:text-primary">
          {course.title}
        </Link>
        {source ? <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{source}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="size-4 text-primary" /> {course.totalLessons} Lessons
          </span>
          {course.estimatedDuration ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-primary" /> {formatDuration(course.estimatedDuration * 60)}
            </span>
          ) : null}
          {course.difficulty ? (
            <span className="inline-flex items-center gap-1.5 capitalize">
              <BarChart3 className="size-4 text-primary" /> {course.difficulty}
            </span>
          ) : null}
        </div>

        <div className="mt-auto pt-4">
          {ready ? (
            <>
              <ProgressBar value={course.progress} size="sm" />
              <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
                <span className="text-xs text-muted-foreground">
                  {course.completedLessons}/{course.totalLessons} done · {relativeTime(course.lastAccessedAt, now)}
                </span>
                <Link
                  href={`/dashboard/courses/${course.id}/learn`}
                  className={cn(buttonVariants({ size: "sm", variant: started ? "ink" : "outline" }), "h-9 rounded-xl px-3.5")}
                >
                  <PlayCircle className="size-3.5" />
                  {course.progress === 100 ? "Review" : started ? "Continue" : "Start"}
                </Link>
              </div>
            </>
          ) : (
            <Link
              href={`/dashboard/courses/${course.id}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-9 w-full rounded-xl")}
            >
              {course.status === "failed" ? "View details" : "View progress"} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
