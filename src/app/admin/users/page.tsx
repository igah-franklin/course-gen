import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setUserRoleAction } from "@/lib/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { AdminToolbar, PAGE_SIZE, Pagination, clean } from "@/components/admin/admin-list";
import { PageHeader } from "@/components/shared/ui-bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createAdminClient();

  let query = db
    .from("profiles")
    .select("id, full_name, email, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`email.ilike.%${clean(q)}%,full_name.ilike.%${clean(q)}%`);
  if (status === "admin") query = query.eq("role", "admin");
  const { data: users, count } = await query;

  const ids = (users ?? []).map((u) => u.id);
  const [{ data: courses }, { data: certs }] = await Promise.all([
    ids.length ? db.from("courses").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string }[] }),
    ids.length ? db.from("certificates").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const tally = (rows: { user_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.user_id === id).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Users" description={`${count ?? 0} registered users`} />
      <AdminToolbar
        basePath="/admin/users"
        q={q}
        active={status}
        filters={[
          { key: "all", label: "All" },
          { key: "admin", label: "Admins" },
        ]}
        placeholder="Search name or email…"
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Courses</TableHead>
              <TableHead className="text-right">Certificates</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(users ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  <span className={u.role === "admin" ? "rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{tally(courses, u.id)}</TableCell>
                <TableCell className="text-right tabular-nums">{tally(certs, u.id)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {u.id !== me.id &&
                    (u.role === "admin" ? (
                      <ActionButton action={setUserRoleAction.bind(null, u.id, "user")} label="Remove admin" success="Role updated" confirm={`Remove admin access for ${u.email}?`} variant="ghost" />
                    ) : (
                      <ActionButton action={setUserRoleAction.bind(null, u.id, "admin")} label="Make admin" success="Role updated" confirm={`Grant admin access to ${u.email}?`} />
                    ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination basePath="/admin/users" page={page} pages={Math.ceil((count ?? 0) / PAGE_SIZE)} params={{ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }} />
    </div>
  );
}
