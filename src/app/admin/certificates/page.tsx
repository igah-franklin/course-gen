import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCertificateAction } from "@/lib/actions/admin";
import { ActionButton } from "@/components/admin/action-button";
import { AdminToolbar, PAGE_SIZE, Pagination, clean } from "@/components/admin/admin-list";
import { PageHeader } from "@/components/shared/ui-bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Certificates" };

export default async function AdminCertificates({ searchParams }: PageProps<"/admin/certificates">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = typeof sp.status === "string" ? sp.status : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createAdminClient();
  let query = db
    .from("certificates")
    .select("id, certificate_number, verification_token, recipient_name, course_title, issued_at, revoked, regeneration_allowed", { count: "exact" })
    .order("issued_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`certificate_number.ilike.%${clean(q)}%,recipient_name.ilike.%${clean(q)}%,course_title.ilike.%${clean(q)}%`);
  if (status === "revoked") query = query.eq("revoked", true);
  const { data: certs, count } = await query;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Certificates" description={`${count ?? 0} certificates issued`} />
      <AdminToolbar
        basePath="/admin/certificates"
        q={q}
        active={status}
        filters={[
          { key: "all", label: "All" },
          { key: "revoked", label: "Revoked" },
        ]}
        placeholder="Search ID, name or course…"
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Certificate</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(certs ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/certificate/verify/${c.verification_token}`} target="_blank" className="font-mono text-xs hover:text-primary">
                    {c.certificate_number}
                  </Link>
                  {c.revoked && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">revoked</span>}
                  {c.regeneration_allowed && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[11px]">regen allowed</span>}
                </TableCell>
                <TableCell>{c.recipient_name}</TableCell>
                <TableCell className="max-w-xs truncate">{c.course_title}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(c.issued_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    {!c.regeneration_allowed && (
                      <ActionButton
                        action={adminCertificateAction.bind(null, c.id, "allow_regeneration")}
                        label="Allow regeneration"
                        success="The learner can regenerate this certificate once"
                        variant="ghost"
                      />
                    )}
                    {c.revoked ? (
                      <ActionButton action={adminCertificateAction.bind(null, c.id, "restore")} label="Restore" success="Restored" />
                    ) : (
                      <ActionButton
                        action={adminCertificateAction.bind(null, c.id, "revoke")}
                        label="Revoke"
                        success="Revoked"
                        confirm="Revoke this certificate? Verification will show it as revoked."
                        variant="destructive"
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination basePath="/admin/certificates" page={page} pages={Math.ceil((count ?? 0) / PAGE_SIZE)} params={{ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }} />
    </div>
  );
}
