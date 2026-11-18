"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVideoMetadata, VideoNotFoundError, type VideoMetadata } from "@/lib/youtube/metadata";
import { canonicalWatchUrl, parseYouTubeUrl } from "@/lib/youtube/url";
import { transcriptProviderConfigured } from "@/lib/transcript/providers";
import { createCourseForUser, type CreateCourseInput } from "@/lib/courses/create";
import { loadAssistantJob, nextStep } from "@/lib/assistant/engine";
import { SOURCE_JOB_TYPES } from "@/lib/jobs/pipeline";
import { aiConfigured } from "@/lib/ai/provider";
import { kickJob } from "@/lib/jobs/runner";
import { serverEnv } from "@/lib/env";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function ownPath(userId: string, path?: string) {
  return Boolean(path && path.startsWith(`${userId}/`) && !path.includes(".."));
}

async function authed() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  return user;
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

export type VideoPreview = VideoMetadata & {
  url: string;
  capabilities: { ai: boolean; transcriptProvider: boolean; fullMetadata: boolean; assistant: boolean };
  existingCourseId: string | null;
};

export async function previewVideoAction(url: string): Promise<Result<VideoPreview>> {
  const user = await authed();
  const parsed = parseYouTubeUrl(url);
  if (!parsed) {
    return { ok: false, error: "That doesn't look like a YouTube video link. Try youtube.com/watch?v=…, youtu.be/… or a Shorts link." };
  }
  try {
    const meta = await fetchVideoMetadata(parsed.videoId, parsed.kind === "short");
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("courses")
      .select("id")
      .eq("user_id", user.id)
      .eq("youtube_video_id", parsed.videoId)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      ok: true,
      data: {
        ...meta,
        url: canonicalWatchUrl(parsed.videoId),
        capabilities: {
          ai: aiConfigured(),
          assistant: true,
          transcriptProvider: transcriptProviderConfigured(),
          fullMetadata: Boolean(serverEnv.youtubeApiKey),
        },
        existingCourseId: existing?.id ?? null,
      },
    };
  } catch (e) {
    if (e instanceof VideoNotFoundError) return { ok: false, error: e.message };
    console.error("[preview]", e);
    return { ok: false, error: "We couldn't retrieve this video's details. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/* Create                                                                      */
/* -------------------------------------------------------------------------- */

export async function createCourseAction(
  input: CreateCourseInput,
): Promise<Result<{ courseId: string; jobId: string; engine: "server" | "assistant" }>> {
  const user = await authed();
  const res = await createCourseForUser(user.id, input);
  if (!res.ok) return res;
  if (res.data.engine === "server") {
    after(() => kickJob(res.data.jobId));
  } else {
    // Run the server-only steps (metadata + transcript) now, so the user's
    // assistant can start analysing as soon as it connects.
    after(async () => {
      try {
        await nextStep(await loadAssistantJob(user.id, res.data.courseId));
      } catch (e) {
        console.error("[assistant] prepare failed", e);
      }
    });
  }
  revalidatePath("/dashboard");
  return res;
}

/* -------------------------------------------------------------------------- */
/* Job control                                                                 */
/* -------------------------------------------------------------------------- */

async function ownedCourse(courseId: string) {
  const user = await authed();
  const supabase = await createClient();
  const { data } = await supabase.from("courses").select("id, user_id").eq("id", courseId).maybeSingle();
  if (!data || (data.user_id !== user.id && user.role !== "admin")) throw new Error("Course not found.");
  return { user, course: data };
}

export async function retryJobAction(jobId: string): Promise<Result<null>> {
  const user = await authed();
  const db = createAdminClient();
  const { data: job } = await db.from("course_generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || (job.user_id !== user.id && user.role !== "admin")) return { ok: false, error: "Job not found." };
  if (job.status !== "failed") return { ok: false, error: "Only failed jobs can be retried." };
  // Failed tasks get fresh attempts; completed tasks are kept (idempotent resume).
  await db.from("job_tasks").update({ status: "pending", attempts: 0, error: null }).eq("job_id", jobId).in("status", ["failed", "running"]);
  await db
    .from("course_generation_jobs")
    .update({ status: "queued", error_message: null, completed_at: null, next_run_at: new Date().toISOString(), locked_until: null })
    .eq("id", jobId);
  if (SOURCE_JOB_TYPES.includes(job.job_type)) await db.from("courses").update({ status: "processing" }).eq("id", job.course_id);
  if (job.job_type !== "assistant_generate") after(() => kickJob(jobId));
  revalidatePath(`/dashboard/courses/${job.course_id}`);
  return { ok: true, data: null };
}

export async function cancelJobAction(jobId: string): Promise<Result<null>> {
  const user = await authed();
  const db = createAdminClient();
  const { data: job } = await db.from("course_generation_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || (job.user_id !== user.id && user.role !== "admin")) return { ok: false, error: "Job not found." };
  if (!["queued", "running", "waiting"].includes(job.status)) return { ok: false, error: "Job is not running." };
  await db.from("course_generation_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", jobId);
  if (SOURCE_JOB_TYPES.includes(job.job_type)) await db.from("courses").update({ status: "failed" }).eq("id", job.course_id);
  revalidatePath(`/dashboard/courses/${job.course_id}`);
  return { ok: true, data: null };
}

async function startSubJob(
  courseId: string,
  jobType: "regenerate_lesson" | "regenerate_illustrations",
  lessonId: string,
  instructions?: string,
): Promise<Result<{ jobId: string }>> {
  const { user } = await ownedCourse(courseId);
  if (!aiConfigured()) return { ok: false, error: "AI provider is not configured." };
  const db = createAdminClient();
  const { data: lesson } = await db.from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
  if (!lesson || lesson.course_id !== courseId) return { ok: false, error: "Lesson not found." };
  const { data: running } = await db
    .from("course_generation_jobs")
    .select("id")
    .eq("course_id", courseId)
    .in("status", ["queued", "running", "waiting"])
    .limit(1);
  if (running?.length) return { ok: false, error: "This course already has a job in progress." };
  const { data: source } = await db
    .from("course_generation_jobs")
    .select("id")
    .eq("course_id", courseId)
    .in("job_type", SOURCE_JOB_TYPES)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!source) return { ok: false, error: "The course must finish generating first." };

  const { data: job, error } = await db
    .from("course_generation_jobs")
    .insert({
      user_id: user.id,
      course_id: courseId,
      job_type: jobType,
      input: { lessonId, sourceJobId: source.id, instructions: instructions?.slice(0, 1000) || null },
      current_stage: jobType === "regenerate_lesson" ? "lessons" : "illustrations",
    })
    .select("id")
    .single();
  if (error || !job) return { ok: false, error: "Could not start the job." };
  after(() => kickJob(job.id));
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { ok: true, data: { jobId: job.id } };
}

export async function regenerateLessonAction(courseId: string, lessonId: string, instructions?: string) {
  return startSubJob(courseId, "regenerate_lesson", lessonId, instructions);
}

export async function regenerateIllustrationsAction(courseId: string, lessonId: string, instructions?: string) {
  return startSubJob(courseId, "regenerate_illustrations", lessonId, instructions);
}

/* -------------------------------------------------------------------------- */
/* Course management (RLS + column grants enforce ownership & editable fields) */
/* -------------------------------------------------------------------------- */

const CourseEdit = z.object({
  title: z.string().trim().min(3).max(200),
  subtitle: z.string().trim().max(300).nullable(),
  description: z.string().trim().max(20000).nullable(),
  is_public: z.boolean(),
  require_final_assessment: z.boolean(),
  passing_score: z.number().int().min(0).max(100),
});

export async function updateCourseAction(courseId: string, input: z.input<typeof CourseEdit>): Promise<Result<null>> {
  await ownedCourse(courseId);
  const parsed = CourseEdit.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      description: parsed.data.description,
      is_public: parsed.data.is_public,
      completion_settings: {
        require_final_assessment: parsed.data.require_final_assessment,
        passing_score: parsed.data.passing_score,
      },
    })
    .eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("quizzes").update({ passing_score: parsed.data.passing_score }).eq("course_id", courseId);
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { ok: true, data: null };
}

export async function updateModuleAction(courseId: string, moduleId: string, input: { title: string; description: string | null }): Promise<Result<null>> {
  await ownedCourse(courseId);
  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: "Title is too short." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("course_modules")
    .update({ title: title.slice(0, 200), description: input.description?.slice(0, 2000) ?? null })
    .eq("id", moduleId)
    .eq("course_id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { ok: true, data: null };
}

const LessonEdit = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).nullable(),
  introduction: z.string().max(20000),
  sections: z.array(z.object({ heading: z.string().max(300), body: z.string().max(50000) })).max(40),
  key_takeaways: z.array(z.string().max(1000)).max(40),
  is_required: z.boolean(),
});

/** Edits update the lesson in place, so learner progress (keyed by lesson id) is preserved. */
export async function updateLessonAction(courseId: string, lessonId: string, input: z.input<typeof LessonEdit>): Promise<Result<null>> {
  await ownedCourse(courseId);
  const parsed = LessonEdit.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("content").eq("id", lessonId).eq("course_id", courseId).maybeSingle();
  if (!lesson) return { ok: false, error: "Lesson not found." };
  const content = {
    ...(lesson.content as Record<string, unknown>),
    introduction: parsed.data.introduction,
    explanation_sections: parsed.data.sections,
    key_takeaways: parsed.data.key_takeaways.filter(Boolean),
    edited_by_author: true,
  };
  const { error } = await supabase
    .from("lessons")
    .update({ title: parsed.data.title, description: parsed.data.description, content, is_required: parsed.data.is_required })
    .eq("id", lessonId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { ok: true, data: null };
}

export async function deleteCourseAction(courseId: string): Promise<Result<null>> {
  await ownedCourse(courseId);
  const supabase = await createClient();
  const { error } = await supabase.from("courses").delete().eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/courses");
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}

export async function deleteIllustrationAction(courseId: string, illustrationId: string): Promise<Result<null>> {
  await ownedCourse(courseId);
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_illustrations").delete().eq("id", illustrationId).eq("course_id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { ok: true, data: null };
}

/** Attach a user-uploaded screenshot to a lesson as an illustration. */
export async function addLessonScreenshotAction(
  courseId: string,
  lessonId: string,
  input: { path: string; title: string; description?: string; timestamp?: number | null },
): Promise<Result<null>> {
  const { user } = await ownedCourse(courseId);
  if (!ownPath(user.id, input.path)) return { ok: false, error: "Invalid upload." };
  const db = createAdminClient();
  const { data: lesson } = await db.from("lessons").select("course_id").eq("id", lessonId).maybeSingle();
  if (lesson?.course_id !== courseId) return { ok: false, error: "Lesson not found." };
  const { error } = await db.from("lesson_illustrations").insert({
    lesson_id: lessonId,
    course_id: courseId,
    image_type: "image",
    source: "user_upload",
    title: input.title.slice(0, 200) || "Screenshot",
    description: input.description?.slice(0, 2000) ?? null,
    storage_path: input.path,
    timestamp_seconds: input.timestamp ?? null,
    position: 200,
    metadata: { bucket: "uploads" },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { ok: true, data: null };
}
