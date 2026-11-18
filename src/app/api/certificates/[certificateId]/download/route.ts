import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

/** Streams the learner's own certificate PDF (RLS-checked ownership). */
export async function GET(_req: Request, ctx: RouteContext<"/api/certificates/[certificateId]/download">) {
  const { certificateId } = await ctx.params;
  if (!isSupabaseConfigured()) return new Response("Database not configured", { status: 503 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });

  const { data: cert } = await supabase
    .from("certificates")
    .select("certificate_url, certificate_number, revoked")
    .eq("id", certificateId)
    .maybeSingle();
  if (!cert?.certificate_url) return new Response("Not found", { status: 404 });
  if (cert.revoked) return new Response("This certificate has been revoked.", { status: 410 });

  const { data: file, error } = await createAdminClient().storage.from("certificates").download(cert.certificate_url);
  if (error || !file) return new Response("Certificate file missing", { status: 404 });

  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificate-${cert.certificate_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
