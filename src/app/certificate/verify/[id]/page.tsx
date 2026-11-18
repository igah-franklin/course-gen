import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarDays, Hash, ShieldX, BookOpen } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedCertificateSettings } from "@/lib/settings-cached";
import { VerifyLookup } from "@/components/shared/verify-lookup";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Verify certificate",
  description: "Confirm that a certificate of completion is authentic.",
  robots: { index: false },
};

export default function VerifyPage({ params }: PageProps<"/certificate/verify/[id]">) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-14">
        <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
          <VerificationResult params={params} />
        </Suspense>
        <div className="mt-10">
          <VerifyLookup />
        </div>
      </main>
    </div>
  );
}

async function VerificationResult({ params }: { params: PageProps<"/certificate/verify/[id]">["params"] }) {
  const { id } = await params;
  const lookup = decodeURIComponent(id).trim().slice(0, 100);
  if (!isSupabaseConfigured() || !serverEnv.supabaseServiceRoleKey) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Certificate verification is unavailable: the database is not configured on this server.
      </div>
    );
  }
  const db = createAdminClient();
  const column = /^[A-Z]{2}-\d{4}-[A-Z0-9]{8}$/i.test(lookup) ? "certificate_number" : "verification_token";
  // Only non-sensitive fields are selected — never email or account ids.
  const { data: cert } = await db
    .from("certificates")
    .select("certificate_number, recipient_name, course_title, issued_at, revoked")
    .eq(column, column === "certificate_number" ? lookup.toUpperCase() : lookup)
    .maybeSingle();
  const branding = await getCachedCertificateSettings();

  if (!cert || cert.revoked) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          {cert?.revoked ? "Certificate revoked" : "Certificate not found"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {cert?.revoked
            ? "This certificate was issued but has since been revoked by the platform."
            : "We couldn't find a valid certificate with this ID. Check the ID or scan the QR code on the certificate again."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="h-1.5" style={{ backgroundColor: branding.accent_color }} />
      <div className="p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <BadgeCheck className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Valid certificate</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This certificate of completion was issued by {branding.platform_name}.
        </p>
      </div>
      <dl className="divide-y border-t text-sm">
        <Row icon={BadgeCheck} label="Awarded to" value={cert.recipient_name} />
        <Row icon={BookOpen} label="Course" value={cert.course_title} />
        <Row
          icon={CalendarDays}
          label="Issued"
          value={new Date(cert.issued_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        />
        <Row icon={Hash} label="Certificate ID" value={cert.certificate_number} mono />
      </dl>
      <p className="border-t bg-muted/30 px-6 py-4 text-center text-xs text-muted-foreground">
        Want your own? <Link href="/signup" className="font-medium text-primary hover:underline">Create a course from any YouTube video</Link>
      </p>
    </div>
  );
}

function Row({ icon: Icon, label, value, mono }: { icon: typeof Hash; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-[13px] font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
