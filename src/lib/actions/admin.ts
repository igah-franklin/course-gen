"use server";

import { after } from "next/server";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiSettings, CertificateSettings, CommunitySettings, CompletionSettings, PaymentSettings } from "@/lib/settings";
import { SUPPORTED_MODELS } from "@/lib/ai/pricing";
import { kickJob } from "@/lib/jobs/runner";

type Result = { ok: true } | { ok: false; error: string };

/** Every admin action re-verifies the caller server-side. */
async function admin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("Forbidden");
  return { user, db: createAdminClient() };
}

export async function setUserRoleAction(userId: string, role: "user" | "admin"): Promise<Result> {
  const { user, db } = await admin();
  if (userId === user.id && role !== "admin") return { ok: false, error: "You can't remove your own admin role." };
  const { error } = await db.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function adminDeleteCourseAction(courseId: string): Promise<Result> {
  const { db } = await admin();
  const { error } = await db.from("courses").delete().eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/courses");
  return { ok: true };
}

export async function adminSetCoursePublicAction(courseId: string, isPublic: boolean): Promise<Result> {
  const { db } = await admin();
  const { error } = await db.from("courses").update({ is_public: isPublic }).eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/courses");
  return { ok: true };
}

export async function adminRetryJobAction(jobId: string): Promise<Result> {
  const { db } = await admin();
  const { data: job } = await db.from("course_generation_jobs").select("id, course_id, job_type, status").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "Job not found" };
  await db.from("job_tasks").update({ status: "pending", attempts: 0, error: null }).eq("job_id", jobId).in("status", ["failed", "running"]);
  await db
    .from("course_generation_jobs")
    .update({ status: "queued", error_message: null, completed_at: null, locked_until: null, next_run_at: new Date().toISOString() })
    .eq("id", jobId);
  if (job.job_type === "generate_course" || job.job_type === "assistant_generate") {
    await db.from("courses").update({ status: "processing" }).eq("id", job.course_id);
  }
  if (job.job_type !== "assistant_generate") after(() => kickJob(jobId));
  revalidatePath("/admin/jobs");
  return { ok: true };
}

export async function adminCancelJobAction(jobId: string): Promise<Result> {
  const { db } = await admin();
  await db
    .from("course_generation_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "running", "waiting"]);
  revalidatePath("/admin/jobs");
  return { ok: true };
}

export async function adminCertificateAction(certificateId: string, op: "revoke" | "restore" | "allow_regeneration"): Promise<Result> {
  const { db } = await admin();
  const patch =
    op === "revoke" ? { revoked: true } : op === "restore" ? { revoked: false } : { regeneration_allowed: true };
  const { error } = await db.from("certificates").update(patch).eq("id", certificateId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/certificates");
  return { ok: true };
}

const SettingsInput = z.object({
  community: z.object({ whatsapp_url: z.string().trim(), telegram_url: z.string().trim() }),
  certificates: CertificateSettings,
  completion: CompletionSettings,
  ai: AiSettings.extend({ model: z.string().refine((m) => SUPPORTED_MODELS.includes(m), "Unsupported model") }),
  payments: z.object({ platform_fee_percent: z.number().min(0, "Fee must be 0–90%").max(90, "Fee must be 0–90%") }),
});

export async function saveSettingsAction(input: z.input<typeof SettingsInput>): Promise<Result> {
  const { user, db } = await admin();
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  const urlOrNull = (v: string) => {
    if (!v) return null;
    const ok = /^https:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com|www\.whatsapp\.com|t\.me|telegram\.me)\//i.test(v);
    if (!ok) throw new Error(`"${v}" is not a WhatsApp or Telegram invite link (must start with https://chat.whatsapp.com/ or https://t.me/).`);
    return v;
  };
  let community;
  try {
    community = CommunitySettings.parse({
      whatsapp_url: urlOrNull(parsed.data.community.whatsapp_url),
      telegram_url: urlOrNull(parsed.data.community.telegram_url),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid link" };
  }
  const rows = [
    { key: "community", value: community },
    { key: "certificates", value: parsed.data.certificates },
    { key: "completion", value: parsed.data.completion },
    { key: "ai", value: parsed.data.ai },
    { key: "payments", value: PaymentSettings.parse(parsed.data.payments) },
  ].map((r) => ({ ...r, updated_by: user.id }));
  const { error } = await db.from("platform_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  updateTag("settings");
  revalidatePath("/admin/settings");
  return { ok: true };
}
