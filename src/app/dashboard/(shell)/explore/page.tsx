import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Compass, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration } from "@/lib/youtube/url";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Explore Courses" };

const PAGE_SIZE = 12;

export default async function ExplorePage({ searchParams }: PageProps<"/dashboard/explore">) {
  await requireUser("/dashboard/explore");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("courses")
    .select("id, title, subtitle, thumbnail_url, channel_name, difficulty, estimated_duration", { count: "exact" })
    .eq("is_public", true)
    .in("status", ["ready", "needs_review"])
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike("title", `%${q.replace(/[%_,()]/g, " ").trim()}%`);
  const { data: courses, count } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (p: number) => `/dashboard/explore?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Explore Courses"
        description="Courses other learners have generated and shared publicly."
        actions={
          <form action="/dashboard/explore" className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search public courses…" className="h-9 pl-9" aria-label="Search" />
          </form>
        }
      />
      {courses?.length ? (
        <>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/courses/${c.id}`}
                className="group overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-video bg-muted">
                  {c.thumbnail_url ? (
                    <Image src={c.thumbnail_url} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
                  ) : (
                    <BookOpen className="absolute inset-0 m-auto size-8 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4">
                  <p className="line-clamp-2 font-semibold group-hover:text-primary">{c.title}</p>
                  {c.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.subtitle}</p>}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {[c.channel_name, c.difficulty, c.estimated_duration ? formatDuration(c.estimated_duration * 60) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-2">
              <Link href={href(page - 1)} className={cn(buttonVariants({ variant: "outline" }), page <= 1 && "pointer-events-none opacity-50")}>
                <ChevronLeft /> Previous
              </Link>
              <span className="px-3 text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Link href={href(page + 1)} className={cn(buttonVariants({ variant: "outline" }), page >= pages && "pointer-events-none opacity-50")}>
                Next <ChevronRight />
              </Link>
            </nav>
          )}
        </>
      ) : (
        <EmptyState
          icon={Compass}
          title={q ? "No public courses match" : "No public courses yet"}
          description="Course creators can share a course publicly from its edit page."
        />
      )}
    </div>
  );
}
