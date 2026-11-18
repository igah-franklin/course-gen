import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminDeleteCourseAction, adminSetCoursePublicAction } from "@/lib/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { AdminToolbar, PAGE_SIZE, Pagination, clean } from "@/components/admin/admin-list";
import { CourseStatusBadge, PageHeader } from "@/components/shared/ui-bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Courses" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "needs_review", label: "Needs review" },
  { key: "processing", label: "Processing" },
  { key: "failed", label: "Failed" },
  { key: "public", label: "Public" },
];

export default async function AdminCourses({ searchParams }: PageProps<"/admin/courses">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createAdminClient();

  let query = db
    .from("courses")
    .select("id, title, status, is_public, created_at, user_id, channel_name, quality_report", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike("title", `%${clean(q)}%`);
  if (status === "public") query = query.eq("is_public", true);
  else if (status !== "all") query = query.eq("status", status);
  const { data: courses, count } = await query;

  const ownerIds = [...new Set((courses ?? []).map((c) => c.user_id))];
  const { data: owners } = ownerIds.length ? await db.from("profiles").select("id, email").in("id", ownerIds) : { data: [] };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Courses" description={`${count ?? 0} courses`} />
      <AdminToolbar basePath="/admin/courses" q={q} filters={FILTERS} active={status} placeholder="Search title…" />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Course</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Coverage</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(courses ?? []).map((c) => {
              const cov = (c.quality_report as { coverage_ratio?: number })?.coverage_ratio;
              return (
                <TableRow key={c.id}>
                  <TableCell className="max-w-xs">
                    <Link href={`/dashboard/courses/${c.id}`} className="line-clamp-1 font-medium hover:text-primary">
                      {c.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{c.channel_name}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{owners?.find((o) => o.id === c.user_id)?.email}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <CourseStatusBadge status={c.status} />
                      {c.is_public && <span className="text-[11px] text-muted-foreground">public</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cov != null ? `${Math.round(cov * 100)}%` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <ActionButton
                        action={adminSetCoursePublicAction.bind(null, c.id, !c.is_public)}
                        label={c.is_public ? "Unpublish" : "Publish"}
                        success="Updated"
                        variant="ghost"
                      />
                      <ActionButton
                        action={adminDeleteCourseAction.bind(null, c.id)}
                        label="Delete"
                        success="Course deleted"
                        confirm={`Permanently delete "${c.title}" and all learner data for it?`}
                        variant="destructive"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination basePath="/admin/courses" page={page} pages={Math.ceil((count ?? 0) / PAGE_SIZE)} params={{ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }} />
    </div>
  );
}
