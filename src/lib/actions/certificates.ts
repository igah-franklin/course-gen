"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompletionStatus } from "@/lib/completion";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { getSetting } from "@/lib/settings";
import { verificationUrl } from "@/lib/certificates/urls";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function code(len: number) {
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * Issues (or returns) the learner's certificate for a course. Server-verified
 * eligibility; one certificate per learner per course unless an admin has
 * authorised regeneration.
 */
export async function claimCertificateAction(courseId: string): Promise<Result<{ certificateId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const db = createAdminClient();

  const { data: existing } = await db
    .from("certificates")
    .select("*")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (existing && !existing.regeneration_allowed && existing.certificate_url) {
    return { ok: true, data: { certificateId: existing.id } };
  }

  const status = await getCompletionStatus(user.id, courseId);
  if (!status.eligible) return { ok: false, error: `Not yet eligible: ${status.missing.join("; ")}.` };

  const { data: course } = await db
    .from("courses")
    .select("title, original_video_title, channel_name")
    .eq("id", courseId)
    .single();
  if (!course) return { ok: false, error: "Course not found." };
  const branding = await getSetting("certificates");

  const certificateNumber = existing?.certificate_number ?? `${branding.platform_name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "CF"}-${new Date().getFullYear()}-${code(8)}`;
  const token = existing?.verification_token ?? randomBytes(18).toString("base64url");
  const issuedAt = existing ? new Date(existing.issued_at) : new Date();
  const recipientName = user.fullName;

  const pdf = await renderCertificatePdf({
    platformName: branding.platform_name,
    recipientName,
    courseTitle: course.title,
    issuedAt,
    certificateNumber,
    verificationUrl: verificationUrl(token),
    signatoryName: branding.signatory_name,
    signatoryTitle: branding.signatory_title,
    accentHex: branding.accent_color,
    sourceLine: course.original_video_title ? `Based on "${course.original_video_title}" by ${course.channel_name ?? "the original creator"}` : null,
  });

  const path = `${user.id}/${certificateNumber}.pdf`;
  const { error: upErr } = await db.storage
    .from("certificates")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: "Could not store the certificate." };

  if (existing) {
    await db
      .from("certificates")
      .update({ certificate_url: path, recipient_name: recipientName, course_title: course.title, regeneration_allowed: false })
      .eq("id", existing.id);
    revalidatePath("/dashboard/certificates");
    return { ok: true, data: { certificateId: existing.id } };
  }

  const { data: cert, error } = await db
    .from("certificates")
    .insert({
      user_id: user.id,
      course_id: courseId,
      certificate_number: certificateNumber,
      certificate_url: path,
      verification_token: token,
      recipient_name: recipientName,
      course_title: course.title,
      issued_at: issuedAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !cert) {
    // A concurrent request may have won the unique (user_id, course_id) race.
    const { data: again } = await db.from("certificates").select("id").eq("user_id", user.id).eq("course_id", courseId).maybeSingle();
    if (again) return { ok: true, data: { certificateId: again.id } };
    return { ok: false, error: "Could not issue the certificate." };
  }
  revalidatePath("/dashboard/certificates");
  revalidatePath("/dashboard");
  return { ok: true, data: { certificateId: cert.id } };
}
