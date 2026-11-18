import type { Metadata } from "next";
import { requestNow } from "@/lib/utils/time";
import Link from "next/link";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  GraduationCap,
  Loader2,
  PlayCircle,
  PlusCircle,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/learner";
import { getCachedCommunityLinks } from "@/lib/settings-cached";
import { CourseCard } from "@/components/course/course-card";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { CommunityButtons } from "@/components/shared/community-buttons";
import { EmptyState, FlowStep, PageHeader, SectionCard, StatCard, TONE_BG, relativeTime, type Tone } from "@/components/shared/ui-bits";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [data, links] = await Promise.all([getDashboardData(user.id), getCachedCommunityLinks()]);
  const now = requestNow();
  const firstName = user.fullName.split(" ")[0];

  const achievements = [
    ...data.certificates.map((c) => ({
      key: `cert-${c.id}`,
      tone: "butter" as Tone,
      icon: Award,
      title: "Certificate earned",
      body: c.course_title,
      at: c.issued_at as string,
      href: "/dashboard/certificates",
    })),
    ...data.passedQuizzes.map((a) => ({
      key: `quiz-${a.id}`,
      tone: "lilac" as Tone,
      icon: Trophy,
      title: a.quizzes?.kind === "final" ? "Final assessment passed" : "Quiz passed",
      body: `${a.quizzes?.title ?? "Quiz"} · ${Math.round(Number(a.score))}%`,
      at: a.completed_at,
      href: a.quizzes ? `/dashboard/courses/${a.quizzes.course_id}` : "/dashboard/courses",
    })),
    ...data.recentlyCompleted.map((c) => ({
      key: `course-${c.id}`,
      tone: "mint" as Tone,
      icon: GraduationCap,
      title: "Course completed",
      body: c.title,
      at: c.completedAt ?? c.lastAccessedAt ?? c.createdAt,
      href: `/dashboard/courses/${c.id}`,
    })),
  ]
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 6);

  const milestones = [
    { done: data.stats.totalCourses >= 1, label: "Create your first course" },
    { done: data.stats.inProgress + data.stats.completed >= 1, label: "Complete your first lesson" },
    { done: data.stats.completed >= 1, label: "Finish a course" },
    { done: data.certificates.length >= 1, label: "Earn a certificate" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's where you are in your learning journey."
        actions={
          <Link href="/dashboard/courses/new" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-[15px]")}>
            <PlusCircle /> Create New Course
          </Link>
        }
      />

      {!user.emailVerified && (
        <div className="mb-6 rounded-2xl bg-tile-butter px-5 py-3.5 text-sm">
          Please verify your email address — check your inbox for the confirmation link.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="sky" label="Total Courses" value={data.stats.totalCourses} icon={BookOpen} />
        <StatCard tone="mint" label="Courses Completed" value={data.stats.completed} icon={CheckCircle2} />
        <StatCard tone="lilac" label="Courses In Progress" value={data.stats.inProgress} icon={PlayCircle} />
        <StatCard tone="butter" label="Learning Hours" value={data.stats.learningHours} icon={Clock} hint="Time spent reading lessons" />
      </div>

      {data.processing.length > 0 && (
        <div className="mt-6 space-y-2">
          {data.processing.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/courses/${c.id}`}
              className="flex items-center gap-3 rounded-2xl bg-tile-lilac px-5 py-3.5 text-sm transition-all hover:brightness-[0.98]"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-card/70">
                <Loader2 className="size-4 animate-spin text-primary" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">Generating:</span> {c.title}
              </span>
              <span className="rounded-full bg-card/70 px-3 py-1 text-xs font-medium">View progress →</span>
            </Link>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/dashboard/courses/new", icon: Sparkles, label: "Create New Course", body: "Paste a YouTube URL", tone: "peach" as Tone },
          { href: "/dashboard/courses", icon: BookOpen, label: "Browse My Courses", body: "All your courses", tone: "sky" as Tone },
          { href: "/dashboard/certificates", icon: Award, label: "View Certificates", body: "Download & share", tone: "butter" as Tone },
          { href: "/dashboard/community", icon: Users, label: "Join Learning Community", body: "WhatsApp & Telegram", tone: "mint" as Tone },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3.5 rounded-3xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_oklch(0.3_0.03_40/0.35)]"
          >
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl text-foreground/80", TONE_BG[a.tone])}>
              <a.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.body}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Continue learning */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-medium">Continue Learning</h2>
          <Link href="/dashboard/courses" className="rounded-full border bg-card px-4 py-1.5 text-sm transition-colors hover:bg-muted">
            View all
          </Link>
        </div>
        {data.continueLearning.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {data.continueLearning.map((c) => (
              <CourseCard key={c.id} course={c} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Compass}
            title={data.stats.totalCourses ? "Nothing in progress" : "Create your first course"}
            description={
              data.stats.totalCourses
                ? "Start one of your courses and it will show up here."
                : "Paste any educational YouTube video and we'll turn it into a complete course."
            }
            action={
              data.stats.totalCourses
                ? { href: "/dashboard/courses", label: "Go to My Courses" }
                : { href: "/dashboard/courses/new", label: "Create a Course" }
            }
          />
        )}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <SectionCard title="My Learning Activity" description="Minutes spent learning each day">
          <ActivityChart data={data.activity} />
        </SectionCard>

        <SectionCard title="Recent Achievements">
          {achievements.length ? (
            <ul className="space-y-2.5">
              {achievements.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className={cn("block rounded-2xl p-3.5 transition-all hover:brightness-[0.98]", TONE_BG[a.tone])}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <a.icon className="size-4" /> {a.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-foreground/60">{relativeTime(a.at, now)}</span>
                    </span>
                    <span className="mt-2 block truncate rounded-xl bg-card/70 px-3 py-2 text-[13px]">{a.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground">Your milestones will appear here.</p>
              <ul className="mt-3">
                {milestones.map((m, i) => (
                  <FlowStep key={m.label} done={m.done} last={i === milestones.length - 1} dashed dotLeft={0} dotTop={10}>
                    <span className={cn("block py-2.5 pl-9 text-sm", m.done ? "font-medium" : "text-muted-foreground")}>{m.label}</span>
                  </FlowStep>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      <section className="relative mt-6 flex flex-col items-start justify-between gap-5 overflow-hidden rounded-3xl bg-ink p-7 text-ink-foreground md:flex-row md:items-center">
        <span aria-hidden className="pointer-events-none absolute -top-16 right-1/3 size-48 rounded-full border border-ink-foreground/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full border border-ink-foreground/10" />
        <div className="relative">
          <h2 className="text-xl font-medium">
            Learn better, together<span className="text-primary">.</span>
          </h2>
          <p className="mt-1 text-sm text-ink-foreground/70">
            Ask questions, share your progress, and get support from other learners.
          </p>
        </div>
        <CommunityButtons links={links} className="relative" />
      </section>
    </div>
  );
}
