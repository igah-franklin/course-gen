import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, BookOpen, ChevronLeft, ChevronRight, Clock, Compass, FileText, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { formatDuration } from "@/lib/youtube/url";
import { priceLabel } from "@/lib/money";
import { SOURCE_TYPE_LABEL, sourceTypeOf } from "@/lib/sources/labels";
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
    .select("id, title, subtitle, thumbnail_url, channel_name, difficulty, estimated_duration, price_amount, currency, source_type", { count: "exact" })
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
        description="Free and paid courses shared by creators on the platform."
        actions={
          <form action="/dashboard/explore" className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Search courses…" className="h-11 rounded-2xl bg-card pl-10" aria-label="Search" />
          </form>
        }
      />
      {courses?.length ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/courses/${c.id}`}
                className="group flex flex-col rounded-3xl border bg-card p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_oklch(0.3_0.03_40/0.35)]"
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-tile-sky">
                  {c.thumbnail_url ? (
                    <Image src={c.thumbnail_url} alt="" fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  ) : (
                    <BookOpen className="absolute inset-0 m-auto size-8 text-foreground/40" />
                  )}
                  <span className="absolute right-3 bottom-3 rounded-xl bg-card px-3 py-1.5 text-sm font-medium shadow-sm">
                    {priceLabel(c.price_amount ?? 0, c.currency ?? "NGN")}
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-3 pt-4 pb-2">
                  <p className="line-clamp-2 text-lg leading-snug font-medium group-hover:text-primary">{c.title}</p>
                  {c.subtitle && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{c.subtitle}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-[13px]">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="size-4 text-primary" /> {SOURCE_TYPE_LABEL[sourceTypeOf(c.source_type)]}
                    </span>
                    {c.estimated_duration ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-4 text-primary" /> {formatDuration(c.estimated_duration * 60)}
                      </span>
                    ) : null}
                    {c.difficulty ? (
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <BarChart3 className="size-4 text-primary" /> {c.difficulty}
                      </span>
                    ) : null}
                  </div>
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
          description="Creators can publish a course from its page with “Share & sell”."
        />
      )}
    </div>
  );
}
