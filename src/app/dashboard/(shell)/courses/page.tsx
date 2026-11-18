import type { Metadata } from "next";
import { requestNow } from "@/lib/utils/time";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, PlusCircle, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyCourses } from "@/lib/data/learner";
import { CourseCard } from "@/components/course/course-card";
import { EmptyState, PageHeader } from "@/components/shared/ui-bits";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Courses" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "not_started", label: "Not started" },
  { key: "completed", label: "Completed" },
  { key: "processing", label: "Generating" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function MyCoursesPage({ searchParams }: PageProps<"/dashboard/courses">) {
  const user = await requireUser("/dashboard/courses");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const filter = (FILTERS.some((f) => f.key === sp.filter) ? sp.filter : "all") as FilterKey;
  const page = Math.max(1, Number(sp.page) || 1);
  const { courses, total, pageSize } = await getMyCourses(user.id, { q, filter, page, pageSize: 12 });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const now = requestNow();

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, filter, page: 1, ...patch };
    if (merged.q) p.set("q", String(merged.q));
    if (merged.filter && merged.filter !== "all") p.set("filter", String(merged.filter));
    if (Number(merged.page) > 1) p.set("page", String(merged.page));
    const s = p.toString();
    return `/dashboard/courses${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My Courses"
        description={`${total} course${total === 1 ? "" : "s"}`}
        actions={
          <Link href="/dashboard/courses/new" className={cn(buttonVariants({ size: "lg" }), "px-4")}>
            <PlusCircle /> Create a Course
          </Link>
        }
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ filter: f.key })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form action="/dashboard/courses" className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Input name="q" defaultValue={q} placeholder="Search courses…" className="h-9 pl-9" aria-label="Search courses" />
        </form>
      </div>

      {courses.length ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} now={now} />
            ))}
          </div>
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
              <Link
                aria-disabled={page <= 1}
                href={href({ page: page - 1 })}
                className={cn(buttonVariants({ variant: "outline" }), page <= 1 && "pointer-events-none opacity-50")}
              >
                <ChevronLeft /> Previous
              </Link>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Link
                aria-disabled={page >= pages}
                href={href({ page: page + 1 })}
                className={cn(buttonVariants({ variant: "outline" }), page >= pages && "pointer-events-none opacity-50")}
              >
                Next <ChevronRight />
              </Link>
            </nav>
          )}
        </>
      ) : (
        <EmptyState
          icon={BookOpen}
          title={q || filter !== "all" ? "No courses match" : "No courses yet"}
          description={
            q || filter !== "all"
              ? "Try a different search or filter."
              : "Paste a YouTube link to generate your first complete course."
          }
          action={q || filter !== "all" ? { href: "/dashboard/courses", label: "Clear filters" } : { href: "/dashboard/courses/new", label: "Create a Course" }}
        />
      )}
    </div>
  );
}
