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
          <Link href="/dashboard/courses/new" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-[15px]")}>
            <PlusCircle /> Create a Course
          </Link>
        }
      />

      <div className="mb-8 flex flex-col-reverse gap-4 border-b md:flex-row md:items-end md:justify-between">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Filter courses">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Link
                key={f.key}
                href={href({ filter: f.key })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 border-b-2 pb-3 text-[15px] whitespace-nowrap transition-colors",
                  active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                {active ? <span className="ml-1 tabular-nums">({String(total).padStart(2, "0")})</span> : null}
              </Link>
            );
          })}
        </nav>
        <form action="/dashboard/courses" className="relative w-full pb-3 md:w-72">
          <Search className="pointer-events-none absolute top-[calc(50%-6px)] left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Input name="q" defaultValue={q} placeholder="Search courses…" className="h-11 rounded-2xl bg-card pl-10" aria-label="Search courses" />
        </form>
      </div>

      {courses.length ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} now={now} />
            ))}
          </div>
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
              <Link
                aria-disabled={page <= 1}
                href={href({ page: page - 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full", page <= 1 && "pointer-events-none opacity-50")}
              >
                <ChevronLeft /> Previous
              </Link>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Link
                aria-disabled={page >= pages}
                href={href({ page: page + 1 })}
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full", page >= pages && "pointer-events-none opacity-50")}
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
