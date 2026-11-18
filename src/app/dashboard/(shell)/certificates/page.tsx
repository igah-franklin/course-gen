import type { Metadata } from "next";
import Link from "next/link";
import { Award, Hash } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { linkedInAddUrl, verificationUrl } from "@/lib/certificates/urls";
import { CertificateActions } from "@/components/course/certificate-actions";
import { EmptyState, PageHeader } from "@/components/shared/ui-bits";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const user = await requireUser("/dashboard/certificates");
  const supabase = await createClient();
  const [{ data: certs }, branding] = await Promise.all([
    supabase
      .from("certificates")
      .select("id, course_id, certificate_number, verification_token, course_title, recipient_name, issued_at, revoked")
      .eq("user_id", user.id)
      .order("issued_at", { ascending: false }),
    getSetting("certificates"),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Certificates" description="Download, share and verify the certificates you've earned." />
      {certs?.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {certs.map((c) => {
            const vUrl = verificationUrl(c.verification_token);
            return (
              <div key={c.id} className="overflow-hidden rounded-2xl border bg-card shadow-xs">
                <div className="relative border-b bg-gradient-to-br from-accent/70 to-background px-6 py-7">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: branding.accent_color }} />
                  <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Award className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Certificate of Completion</p>
                      <Link href={`/dashboard/courses/${c.course_id}`} className="mt-1 block font-semibold leading-snug hover:text-primary">
                        {c.course_title}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Issued {new Date(c.issued_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <Hash className="size-3.5" /> {c.certificate_number}
                    {c.revoked && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-sans text-destructive">Revoked</span>}
                  </p>
                  {!c.revoked && (
                    <CertificateActions
                      id={c.id}
                      verifyUrl={vUrl}
                      linkedInUrl={linkedInAddUrl({
                        name: c.course_title,
                        organization: branding.platform_name,
                        issuedAt: c.issued_at,
                        certId: c.certificate_number,
                        certUrl: vUrl,
                      })}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Complete all lessons of a course (and pass its final assessment) to earn a verifiable certificate."
          action={{ href: "/dashboard/courses", label: "Go to My Courses" }}
        />
      )}
    </div>
  );
}
