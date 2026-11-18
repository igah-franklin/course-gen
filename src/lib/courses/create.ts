import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVideoMetadata, VideoNotFoundError, type VideoMetadata } from "@/lib/youtube/metadata";
import { canonicalWatchUrl, parseYouTubeUrl } from "@/lib/youtube/url";
import { normalizeSegments, parseTranscriptFile } from "@/lib/transcript/parse";
import { transcriptProviderConfigured } from "@/lib/transcript/providers";
import { aiConfigured } from "@/lib/ai/provider";

export const CreateCourseInput = z.object({
  url: z.string().min(1),
  engine: z.enum(["server", "assistant"]).default("server"),
  transcriptSource: z.enum(["captions", "ai_transcription", "media_upload", "manual"]),
  transcriptPath: z.string().optional(), // uploads/<uid>/... for manual
  mediaPath: z.string().optional(), // uploads/<uid>/... for media_upload
  lang: z.string().max(10).optional(),
  frames: z
    .array(z.object({ path: z.string(), timestamp: z.number().int().min(0).nullable(), caption: z.string().max(500).optional() }))
    .max(30)
    .default([]),
});
export type CreateCourseInput = z.input<typeof CreateCourseInput>;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_ACTIVE_JOBS = 3;

function ownPath(userId: string, path?: string) {
  return Boolean(path && path.startsWith(`${userId}/`) && !path.includes(".."));
}

/**
 * Creates a course and its generation job. Shared by the web form and the MCP
 * `create_course` tool. The caller starts the job (background engine) or hands
 * it to the user's assistant (assistant engine).
 */
export async function createCourseForUser(
  userId: string,
  input: CreateCourseInput,
): Promise<Result<{ courseId: string; jobId: string; engine: "server" | "assistant" }>> {
  const parsedInput = CreateCourseInput.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: "Invalid request." };
  const data = parsedInput.data;

  if (data.engine === "server" && !aiConfigured()) {
    return {
      ok: false,
      error: "The built-in AI engine is not configured. Generate with your own Claude or ChatGPT instead (Connect AI).",
    };
  }
  const yt = parseYouTubeUrl(data.url);
  if (!yt) return { ok: false, error: "Invalid YouTube URL. Use a youtube.com/watch, youtu.be or Shorts link." };
  if (data.transcriptSource !== "manual" && data.transcriptSource !== "media_upload" && !transcriptProviderConfigured()) {
    return { ok: false, error: "Automatic transcripts are not configured on this server. Upload a transcript file instead (web app)." };
  }
  if (data.transcriptSource === "media_upload" && !transcriptProviderConfigured()) {
    return { ok: false, error: "Media transcription is not configured on this server." };
  }
  if (data.transcriptSource === "manual" && !ownPath(userId, data.transcriptPath)) {
    return { ok: false, error: "Upload a transcript file first." };
  }
  if (data.transcriptSource === "media_upload" && !ownPath(userId, data.mediaPath)) {
    return { ok: false, error: "Upload a media file first." };
  }
  if (data.frames.some((f) => !ownPath(userId, f.path))) return { ok: false, error: "Invalid screenshot upload." };

  const db = createAdminClient();
  const { count: active } = await db
    .from("course_generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running", "waiting"]);
  if ((active ?? 0) >= MAX_ACTIVE_JOBS) {
    return { ok: false, error: `You already have ${MAX_ACTIVE_JOBS} courses generating. Finish or cancel one first.` };
  }

  // Parse a manual transcript before creating anything, so errors surface immediately.
  let manual: ReturnType<typeof parseTranscriptFile> | null = null;
  if (data.transcriptSource === "manual") {
    const { data: file, error } = await db.storage.from("uploads").download(data.transcriptPath!);
    if (error || !file) return { ok: false, error: "Could not read the uploaded transcript." };
    const text = await file.text();
    if (text.length > 5_000_000) return { ok: false, error: "Transcript file is too large (max 5 MB)." };
    manual = parseTranscriptFile(text);
    if (!manual.segments.length) return { ok: false, error: "The transcript file appears to be empty." };
    if (manual.hasTimestamps) manual.segments = normalizeSegments(manual.segments);
  }

  let meta: VideoMetadata | null = null;
  try {
    meta = await fetchVideoMetadata(yt.videoId, yt.kind === "short");
  } catch (e) {
    if (e instanceof VideoNotFoundError) return { ok: false, error: e.message };
  }

  const { data: course, error: cerr } = await db
    .from("courses")
    .insert({
      user_id: userId,
      title: meta?.title ?? "Untitled course",
      youtube_url: canonicalWatchUrl(yt.videoId),
      youtube_video_id: yt.videoId,
      thumbnail_url: meta?.thumbnailUrl ?? null,
      original_video_title: meta?.title ?? null,
      channel_name: meta?.channelName ?? null,
      video_description: meta?.description ?? null,
      video_duration: meta?.durationSeconds ?? null,
      status: "processing",
      transcript_source: data.transcriptSource,
      generation_engine: data.engine,
    })
    .select("id")
    .single();
  if (cerr || !course) {
    console.error("[create course]", cerr);
    return { ok: false, error: "Could not create the course." };
  }

  if (manual) {
    const rows = manual.segments.map((s, i) => ({ course_id: course.id, position: i, start_seconds: s.start, end_seconds: s.end, text: s.text }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("transcript_segments").insert(rows.slice(i, i + 500));
      if (error) {
        await db.from("courses").delete().eq("id", course.id);
        return { ok: false, error: "Could not store the transcript." };
      }
    }
  }

  if (data.frames.length) {
    await db.from("video_frames").insert(
      data.frames.map((f) => ({
        course_id: course.id,
        user_id: userId,
        storage_path: f.path,
        timestamp_seconds: f.timestamp,
        caption: f.caption ?? null,
      })),
    );
  }

  const { data: job, error: jerr } = await db
    .from("course_generation_jobs")
    .insert({
      user_id: userId,
      course_id: course.id,
      job_type: data.engine === "assistant" ? "assistant_generate" : "generate_course",
      status: "queued",
      current_stage: "metadata",
      input: {
        transcriptSource: data.transcriptSource,
        mediaPath: data.mediaPath ?? null,
        lang: data.lang ?? null,
        isShort: yt.kind === "short",
        manualHasTimestamps: manual?.hasTimestamps ?? null,
      },
    })
    .select("id")
    .single();
  if (jerr || !job) return { ok: false, error: "Could not start course generation." };
  return { ok: true, data: { courseId: course.id, jobId: job.id, engine: data.engine } };
}
