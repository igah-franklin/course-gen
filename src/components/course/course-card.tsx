import Image from "next/image";
import Link from "next/link";
import { BookOpen, Clock, PlayCircle } from "lucide-react";
import type { CourseCard as CourseCardData } from "@/lib/data/learner";
import { CourseStatusBadge, ProgressBar, relativeTime } from "@/components/shared/ui-bits";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CourseCard({ course, now }: { course: CourseCardData; now: number }) {
  const ready = course.status === "ready" || course.status === "needs_review";
  const started = course.completedLessons > 0;
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/dashboard/courses/${course.id}`} className="relative block aspect-video overflow-hidden bg-muted">
        {course.thumbnailUrl ? (
          <Image
            src={course.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <BookOpen className="size-8" />
          </div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <CourseStatusBadge status={course.status} />
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link href={`/dashboard/courses/${course.id}`} className="line-clamp-2 font-semibold leading-snug hover:text-primary">
          {course.title}
        </Link>
        {course.originalVideoTitle && course.originalVideoTitle !== course.title ? (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">From: {course.originalVideoTitle}</p>
        ) : course.channelName ? (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{course.channelName}</p>
        ) : null}

        <div className="mt-auto pt-4">
          {ready ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {course.completedLessons}/{course.totalLessons} lessons
                </span>
                <span className="font-medium text-foreground tabular-nums">{course.progress}%</span>
              </div>
              <ProgressBar value={course.progress} size="sm" className="mt-1.5" />
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="size-3" /> {relativeTime(course.lastAccessedAt, now)}
                </span>
                <Link
                  href={`/dashboard/courses/${course.id}/learn`}
                  className={cn(buttonVariants({ size: "sm", variant: started ? "default" : "outline" }), "h-8 px-3")}
                >
                  <PlayCircle className="size-3.5" />
                  {course.progress === 100 ? "Review" : started ? "Continue Learning" : "Start"}
                </Link>
              </div>
            </>
          ) : (
            <Link
              href={`/dashboard/courses/${course.id}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 w-full")}
            >
              {course.status === "failed" ? "View details" : "View progress"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
