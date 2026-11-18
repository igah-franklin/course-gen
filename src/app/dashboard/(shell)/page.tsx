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
import { EmptyState, PageHeader, SectionCard, StatCard, relativeTime } from "@/components/shared/ui-bits";
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
      icon: Award,
      title: "Certificate earned",
      body: c.course_title,
      at: c.issued_at as string,
      href: "/dashboard/certificates",
    })),
    ...data.passedQuizzes.map((a) => ({
      key: `quiz-${a.id}`,
      icon: Trophy,
      title: a.quizzes?.kind === "final" ? "Final assessment passed" : "Quiz passed",
      body: `${a.quizzes?.title ?? "Quiz"} · ${Math.round(Number(a.score))}%`,
      at: a.completed_at,
      href: a.quizzes ? `/dashboard/courses/${a.quizzes.course_id}` : "/dashboard/courses",
    })),
    ...data.recentlyCompleted.map((c) => ({
      key: `course-${c.id}`,
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
          <Link href="/dashboard/courses/new" className={cn(buttonVariants({ size: "lg" }), "px-4")}>
            <PlusCircle /> Create New Course
          </Link>
        }
      />

      {!user.emailVerified && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          Please verify your email address — check your inbox for the confirmation link.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Courses" value={data.stats.totalCourses} icon={BookOpen} />
        <StatCard label="Courses Completed" value={data.stats.completed} icon={CheckCircle2} />
        <StatCard label="Courses In Progress" value={data.stats.inProgress} icon={PlayCircle} />
        <StatCard label="Learning Hours" value={data.stats.learningHours} icon={Clock} hint="Time spent reading lessons" />
      </div>

      {data.processing.length > 0 && (
        <div className="mt-6 space-y-2">
          {data.processing.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/courses/${c.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs transition-colors hover:border-primary/40"
            >
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">Generating:</span> {c.title}
              </span>
              <span className="text-xs text-muted-foreground">View progress →</span>
            </Link>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/dashboard/courses/new", icon: Sparkles, label: "Create New Course", body: "Paste a YouTube URL" },
          { href: "/dashboard/courses", icon: BookOpen, label: "Browse My Courses", body: "All your courses" },
          { href: "/dashboard/certificates", icon: Award, label: "View Certificates", body: "Download & share" },
          { href: "/dashboard/community", icon: Users, label: "Join Learning Community", body: "WhatsApp & Telegram" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
              <a.icon className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-medium">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.body}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Continue learning */}
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Continue Learning</h2>
          <Link href="/dashboard/courses" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {data.continueLearning.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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
            <ul className="space-y-3">
              {achievements.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="flex items-start gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/60">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                      <a.icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.body}</span>
                      <span className="block text-[11px] text-muted-foreground">{relativeTime(a.at, now)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground">Your milestones will appear here.</p>
              <ul className="mt-4 space-y-2.5">
                {milestones.map((m) => (
                  <li key={m.label} className="flex items-center gap-2.5 text-sm">
                    <CheckCircle2 className={cn("size-4", m.done ? "text-primary" : "text-muted-foreground/40")} />
                    <span className={m.done ? "" : "text-muted-foreground"}>{m.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      <section className="mt-6 flex flex-col items-start justify-between gap-5 rounded-xl border bg-card p-6 shadow-xs md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-semibold">Learn Better, Together.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask questions, share your progress, and get support from other learners.
          </p>
        </div>
        <CommunityButtons links={links} />
      </section>
    </div>
  );
}
