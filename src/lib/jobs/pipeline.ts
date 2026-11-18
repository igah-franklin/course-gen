import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchVideoMetadata } from "@/lib/youtube/metadata";
import { canonicalWatchUrl } from "@/lib/youtube/url";
import {
  chunkTranscript,
  normalizeSegments,
  renderSegments,
  transcriptSlice,
  type TranscriptSegment,
} from "@/lib/transcript/parse";
import { pollTranscriptJob, requestTranscript, type TranscriptSource } from "@/lib/transcript/providers";
import type { AiProvider, ContentPart } from "@/lib/ai/provider";
import {
  ChunkAnalysis,
  CourseOverview,
  Curriculum,
  FrameAnalysis,
  IllustrationSet,
  LessonContent,
  QualityReview,
  QuizSpec,
} from "@/lib/ai/schemas";
import {
  SYSTEM_ANALYZE_CHUNK,
  SYSTEM_ANALYZE_FRAME,
  SYSTEM_CURRICULUM,
  SYSTEM_ILLUSTRATIONS,
  SYSTEM_LESSON,
  SYSTEM_OVERVIEW,
  SYSTEM_QUALITY,
  SYSTEM_QUIZ,
} from "@/lib/ai/prompts";
import { generateConceptImage, imageProviderConfigured } from "@/lib/ai/images";
import { getSetting } from "@/lib/settings";
import type { JobState, JobType, StageKey } from "./stages";

/* ============================================================================
 * Types
 *
 * Each AI step is split into `build*Prompt` (what the model must do) and
 * `apply*` (validate + persist the model's output). The background runner
 * calls the AI itself; the MCP engine hands the prompt to the user's own
 * assistant (Claude / ChatGPT) and runs the same `apply*` on its answer, so
 * both engines share identical instructions and identical checks.
 * ==========================================================================*/

export type JobRow = {
  id: string;
  user_id: string;
  course_id: string;
  job_type: JobType;
  status: string;
  input: Record<string, unknown>;
  state: JobState;
  current_stage: string | null;
};

export type TaskRow = {
  id: string;
  job_id: string;
  stage: StageKey;
  task_key: string;
  status: "pending" | "running" | "waiting" | "completed" | "failed" | "skipped";
  attempts: number;
  payload: Record<string, unknown>;
  result: unknown;
  error: string | null;
  position: number;
};

export type TaskSpec = { key: string; payload?: Record<string, unknown>; position?: number };

export type TaskOutcome =
  | { status: "completed"; result?: unknown }
  | { status: "waiting"; result?: unknown; retryAfterSeconds: number }
  | { status: "skipped"; result?: unknown };

export type Ctx = {
  job: JobRow;
  db: SupabaseClient;
  ai: () => Promise<AiProvider>;
  log: (level: "debug" | "info" | "warn" | "error", message: string, data?: unknown) => Promise<void>;
  memo: Map<string, unknown>;
};

export type Prompt = { system: string; content: ContentPart[] };

export class FatalJobError extends Error {}

/** Raised by strict `apply*` calls when an answer leaves teaching points uncovered. */
export class CoverageError extends Error {
  constructor(
    public missing: { id: string; title: string }[],
    message: string,
  ) {
    super(message);
  }
}

export type Point = ChunkAnalysis["points"][number] & { id: string; chunk: number };

/** Job types whose generation output comes from the analysis of a full video. */
export const SOURCE_JOB_TYPES: JobType[] = ["generate_course", "assistant_generate"];

/* ============================================================================
 * Shared loaders
 * ==========================================================================*/

async function getCourse(ctx: Ctx) {
  const { data, error } = await ctx.db.from("courses").select("*").eq("id", ctx.job.course_id).single();
  if (error || !data) throw new FatalJobError("Course no longer exists.");
  return data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function loadSegments(ctx: Ctx): Promise<TranscriptSegment[]> {
  const memoKey = "segments";
  if (ctx.memo.has(memoKey)) return ctx.memo.get(memoKey) as TranscriptSegment[];
  const out: TranscriptSegment[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await ctx.db
      .from("transcript_segments")
      .select("start_seconds, end_seconds, text")
      .eq("course_id", ctx.job.course_id)
      .order("position")
      .range(from, from + page - 1);
    if (error) throw error;
    for (const r of data ?? []) out.push({ start: Number(r.start_seconds), end: Number(r.end_seconds), text: r.text });
    if (!data || data.length < page) break;
  }
  ctx.memo.set(memoKey, out);
  return out;
}

const hasTs = (ctx: Ctx) => ctx.job.state.hasTimestamps !== false;

async function chunks(ctx: Ctx) {
  return chunkTranscript(await loadSegments(ctx), { hasTimestamps: hasTs(ctx) });
}

/** The full-video job whose analysis feeds this job (itself, or the course's latest one). */
async function sourceJobId(ctx: Ctx): Promise<string> {
  if (SOURCE_JOB_TYPES.includes(ctx.job.job_type)) return ctx.job.id;
  const fromInput = ctx.job.input.sourceJobId as string | undefined;
  if (fromInput) return fromInput;
  const { data } = await ctx.db
    .from("course_generation_jobs")
    .select("id")
    .eq("course_id", ctx.job.course_id)
    .in("job_type", SOURCE_JOB_TYPES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) throw new FatalJobError("The original analysis for this course was not found.");
  return data.id;
}

async function taskResult<T>(ctx: Ctx, jobId: string, key: string): Promise<T | null> {
  const { data } = await ctx.db
    .from("job_tasks")
    .select("result, status")
    .eq("job_id", jobId)
    .eq("task_key", key)
    .maybeSingle();
  return data && data.status === "completed" ? (data.result as T) : null;
}

/** Complete ordered inventory of teaching points from every analysed chunk. */
export async function loadInventory(ctx: Ctx): Promise<{ points: Point[]; duplicates: Set<string> }> {
  if (ctx.memo.has("inventory")) return ctx.memo.get("inventory") as { points: Point[]; duplicates: Set<string> };
  const jobId = await sourceJobId(ctx);
  const { data, error } = await ctx.db
    .from("job_tasks")
    .select("task_key, result, position, status")
    .eq("job_id", jobId)
    .eq("stage", "analyze")
    .like("task_key", "analyze:%")
    .order("position");
  if (error) throw error;
  const points: Point[] = [];
  for (const t of data ?? []) {
    if (t.status !== "completed") continue;
    const r = t.result as { chunk: number; analysis: ChunkAnalysis };
    for (const p of r.analysis.points) {
      points.push({
        ...p,
        id: `c${r.chunk + 1}.${p.local_id}`,
        chunk: r.chunk,
        parent_local_id: p.parent_local_id ? `c${r.chunk + 1}.${p.parent_local_id}` : null,
      });
    }
  }
  const overview = await taskResult<{ overview: CourseOverview }>(ctx, jobId, "overview");
  const duplicates = new Set<string>();
  for (const g of overview?.overview.duplicate_groups ?? []) {
    for (const d of g.duplicate_ids) if (d !== g.keep_id) duplicates.add(d);
  }
  const value = { points, duplicates };
  ctx.memo.set("inventory", value);
  return value;
}

function pointLine(p: Point, full = false) {
  const ts = p.start_seconds != null ? ` @${Math.round(p.start_seconds)}s` : "";
  if (!full) return `- ${p.id} [${p.kind}]${ts} ${p.title}`;
  const parts = [`### ${p.id} [${p.kind}]${ts}: ${p.title}`, p.detail];
  if (p.steps.length) parts.push(`Steps:\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  if (p.code_or_commands.length) parts.push(`Verbatim code/commands:\n${p.code_or_commands.join("\n")}`);
  if (p.visual_dependency !== "none") parts.push(`Visual dependency (${p.visual_dependency}): ${p.visual_note}`);
  return parts.join("\n");
}

async function frameNotes(ctx: Ctx, start?: number | null, end?: number | null) {
  const { data } = await ctx.db
    .from("video_frames")
    .select("id, timestamp_seconds, caption, analysis")
    .eq("course_id", ctx.job.course_id)
    .not("analysis", "is", null);
  return (data ?? [])
    .filter((f) =>
      start == null || end == null || f.timestamp_seconds == null
        ? true
        : f.timestamp_seconds >= start - 30 && f.timestamp_seconds <= end + 30,
    )
    .map((f) => {
      const a = f.analysis as FrameAnalysis;
      return `Frame at ${f.timestamp_seconds ?? "?"}s${f.caption ? ` (learner caption: ${f.caption})` : ""}: ${a.title}. ${a.description}${a.visible_text.length ? ` Visible text: ${a.visible_text.join(" | ")}` : ""}`;
    });
}

const aiCtx = (ctx: Ctx) => ({ userId: ctx.job.user_id, jobId: ctx.job.id, courseId: ctx.job.course_id });
const text = (t: string): ContentPart[] => [{ type: "text", text: t }];

async function orderedLessons(ctx: Ctx) {
  const { data, error } = await ctx.db
    .from("lessons")
    .select("id, title, description, module_id, position, generation_status, covered_point_ids, original_timestamp_start, original_timestamp_end, course_modules!inner(position, title)")
    .eq("course_id", ctx.job.course_id);
  if (error) throw error;
  type Row = {
    id: string;
    title: string;
    description: string | null;
    module_id: string;
    position: number;
    generation_status: string;
    covered_point_ids: string[];
    original_timestamp_start: number | null;
    original_timestamp_end: number | null;
    course_modules: { position: number; title: string };
  };
  return ((data ?? []) as unknown as Row[]).sort(
    (a, b) => a.course_modules.position - b.course_modules.position || a.position - b.position,
  );
}

/* ============================================================================
 * Planning: which tasks does a stage consist of?
 * ==========================================================================*/

export async function planStage(stage: StageKey, ctx: Ctx): Promise<TaskSpec[]> {
  switch (stage) {
    case "metadata":
      return [{ key: "metadata" }];
    case "transcript":
      return [{ key: "transcript" }];
    case "analyze": {
      const cs = await chunks(ctx);
      const specs: TaskSpec[] = cs.map((c) => ({
        key: `analyze:${c.index}`,
        position: c.index,
        payload: { index: c.index, total: cs.length, start: c.start, end: c.end },
      }));
      const { data: frames } = await ctx.db.from("video_frames").select("id").eq("course_id", ctx.job.course_id);
      for (const [i, f] of (frames ?? []).entries()) {
        specs.push({ key: `frame:${f.id}`, position: 10_000 + i, payload: { frameId: f.id } });
      }
      return specs;
    }
    case "objectives":
      return [{ key: "overview" }];
    case "structure":
      return [{ key: "curriculum" }];
    case "lessons": {
      if (ctx.job.job_type === "regenerate_lesson") {
        return [{ key: `lesson:${ctx.job.input.lessonId}`, payload: { lessonId: ctx.job.input.lessonId } }];
      }
      const lessons = await orderedLessons(ctx);
      return lessons.map((l, i) => ({ key: `lesson:${l.id}`, position: i, payload: { lessonId: l.id } }));
    }
    case "illustrations": {
      if (!SOURCE_JOB_TYPES.includes(ctx.job.job_type)) {
        return [{ key: `illustrations:${ctx.job.input.lessonId}`, payload: { lessonId: ctx.job.input.lessonId } }];
      }
      const lessons = await orderedLessons(ctx);
      return lessons
        .filter((l) => l.generation_status === "generated")
        .map((l, i) => ({ key: `illustrations:${l.id}`, position: i, payload: { lessonId: l.id } }));
    }
    case "assessments": {
      const { data: modules } = await ctx.db
        .from("course_modules")
        .select("id, position")
        .eq("course_id", ctx.job.course_id)
        .order("position");
      const specs: TaskSpec[] = (modules ?? []).map((m, i) => ({
        key: `quiz:${m.id}`,
        position: i,
        payload: { moduleId: m.id },
      }));
      specs.push({ key: "quiz:final", position: 999, payload: { final: true } });
      return specs;
    }
    case "quality":
      return [{ key: "qa" }];
    case "save":
      return [{ key: "finalize" }];
  }
}

/** Server-side tasks that never need a language model. */
export function isServerTask(taskKey: string) {
  const kind = taskKey.split(":")[0];
  return kind === "metadata" || kind === "transcript" || kind === "finalize";
}

/* ============================================================================
 * Task execution (background engine)
 * ==========================================================================*/

export async function runTask(task: TaskRow, ctx: Ctx): Promise<TaskOutcome> {
  const [kind] = task.task_key.split(":");
  switch (kind) {
    case "metadata":
      return taskMetadata(ctx);
    case "transcript":
      return taskTranscript(task, ctx);
    case "analyze": {
      const index = Number(task.payload.index);
      const data = await generate(ctx, "analyze_chunk", await buildChunkPrompt(ctx, index), ChunkAnalysis, 32000);
      return { status: "completed", result: await applyChunkAnalysis(ctx, index, data) };
    }
    case "frame": {
      const frameId = String(task.payload.frameId);
      const prompt = await buildFramePrompt(ctx, frameId);
      if (!prompt) return { status: "skipped", result: { reason: "frame missing" } };
      const data = await generate(ctx, "analyze_frame", prompt, FrameAnalysis, 4000, "low");
      return { status: "completed", result: await applyFrameAnalysis(ctx, frameId, data) };
    }
    case "overview": {
      const data = await generate(ctx, "course_overview", await buildOverviewPrompt(ctx), CourseOverview, 16000);
      return { status: "completed", result: await applyOverview(ctx, data) };
    }
    case "curriculum": {
      const data = await generate(ctx, "curriculum", await buildCurriculumPrompt(ctx), Curriculum, 32000);
      return { status: "completed", result: await applyCurriculum(ctx, data, { strict: false }) };
    }
    case "lesson":
      return taskLesson(task, ctx);
    case "illustrations": {
      const lessonId = String(task.payload.lessonId);
      const prompt = await buildIllustrationsPrompt(ctx, lessonId);
      if (!prompt) return { status: "skipped", result: { reason: "no lesson" } };
      const data = await generate(ctx, "generate_illustrations", prompt, IllustrationSet, 24000);
      return { status: "completed", result: await applyIllustrations(ctx, lessonId, data) };
    }
    case "quiz": {
      const brief = await buildQuizPrompt(ctx, task.payload);
      if (!brief) return { status: "skipped", result: { reason: "no generated lessons" } };
      const data = await generate(ctx, brief.isFinal ? "final_assessment" : "module_quiz", brief.prompt, QuizSpec, 24000);
      return { status: "completed", result: await applyQuiz(ctx, task.payload, data) };
    }
    case "qa": {
      const brief = await buildQualityPrompt(ctx);
      const data = await generate(ctx, "quality_review", brief.prompt, QualityReview, 16000);
      return { status: "completed", result: await applyQuality(ctx, data) };
    }
    case "finalize":
      return taskFinalize(ctx);
    default:
      throw new FatalJobError(`Unknown task ${task.task_key}`);
  }
}

async function generate<S extends import("zod").z.ZodType>(
  ctx: Ctx,
  operation: string,
  prompt: Prompt,
  schema: S,
  maxTokens: number,
  effort?: "low",
) {
  const ai = await ctx.ai();
  const { data } = await ai.generateStructured({
    operation,
    system: prompt.system,
    schema,
    maxTokens,
    effort,
    context: aiCtx(ctx),
    content: prompt.content,
  });
  return data;
}

/* ---------------------------------- metadata --------------------------------- */

export async function taskMetadata(ctx: Ctx): Promise<TaskOutcome> {
  const course = await getCourse(ctx);
  const meta = await fetchVideoMetadata(course.youtube_video_id, Boolean(ctx.job.input.isShort));
  await ctx.db
    .from("courses")
    .update({
      original_video_title: meta.title,
      channel_name: meta.channelName,
      video_description: meta.description,
      video_duration: meta.durationSeconds,
      thumbnail_url: meta.thumbnailUrl,
      title: course.title || meta.title,
    })
    .eq("id", course.id);
  return { status: "completed", result: { metadata: meta } };
}

/* --------------------------------- transcript -------------------------------- */

async function storeSegments(ctx: Ctx, segments: TranscriptSegment[]) {
  await ctx.db.from("transcript_segments").delete().eq("course_id", ctx.job.course_id);
  const rows = segments.map((s, i) => ({
    course_id: ctx.job.course_id,
    position: i,
    start_seconds: Math.round(s.start * 100) / 100,
    end_seconds: Math.round(s.end * 100) / 100,
    text: s.text,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.db.from("transcript_segments").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  ctx.memo.delete("segments");
}

export async function taskTranscript(task: TaskRow, ctx: Ctx): Promise<TaskOutcome> {
  const course = await getCourse(ctx);
  const source = (ctx.job.input.transcriptSource as TranscriptSource) ?? "captions";
  let segments: TranscriptSegment[] = [];
  let hasTimestamps = true;
  let lang: string | null = null;

  if (source === "manual") {
    // Already stored when the job was created.
    segments = await loadSegments(ctx);
    hasTimestamps = ctx.job.input.manualHasTimestamps !== false;
    if (!segments.length) throw new FatalJobError("The uploaded transcript is empty.");
  } else {
    const prev = (task.result ?? {}) as { providerJobId?: string };
    let mediaUrl: string | undefined;
    if (source === "media_upload") {
      const path = ctx.job.input.mediaPath as string | undefined;
      if (!path) throw new FatalJobError("No media file was uploaded for transcription.");
      const { data, error } = await ctx.db.storage.from("uploads").createSignedUrl(path, 60 * 60 * 6);
      if (error || !data) throw new FatalJobError("Could not access the uploaded media file.");
      mediaUrl = data.signedUrl;
    }
    const res = prev.providerJobId
      ? await pollTranscriptJob(prev.providerJobId)
      : await requestTranscript({
          source,
          videoUrl: canonicalWatchUrl(course.youtube_video_id),
          mediaUrl,
          lang: (ctx.job.input.lang as string | undefined) || undefined,
        });

    if (res.status === "pending") {
      await ctx.log("info", "Transcription in progress at provider; will check again shortly.");
      return { status: "waiting", result: { providerJobId: res.providerJobId }, retryAfterSeconds: 20 };
    }
    if (res.status === "unavailable") {
      const hint =
        source === "captions"
          ? " This video has no captions available. Re-create the course with AI transcription enabled, or upload a transcript file."
          : "";
      throw new FatalJobError(`${res.reason}${hint}`);
    }
    lang = res.lang;
    hasTimestamps = res.segments.some((s) => s.end > 0);
    segments = hasTimestamps ? normalizeSegments(res.segments) : res.segments;
    await storeSegments(ctx, segments);
  }

  const lastEnd = segments.reduce((m, s) => Math.max(m, s.end), 0);
  const duration = Number(course.video_duration) || null;
  const coverageRatio = hasTimestamps && duration ? Math.min(1, lastEnd / duration) : null;
  const warnings: string[] = [];
  if (!hasTimestamps) warnings.push("The transcript has no timestamps, so lessons cannot link to exact moments in the video.");
  if (coverageRatio != null && coverageRatio < 0.9) {
    warnings.push(
      `The transcript only covers about ${Math.round(coverageRatio * 100)}% of the video's length. Parts of the video without speech or captions were not analysed.`,
    );
  }

  await ctx.db
    .from("courses")
    .update({
      transcript_source: source,
      coverage: {
        transcript_source: source,
        transcript_lang: lang,
        segments: segments.length,
        transcript_seconds: Math.round(lastEnd),
        video_seconds: duration,
        coverage_ratio: coverageRatio,
        has_timestamps: hasTimestamps,
        visual_analysis: "transcript_only",
      },
    })
    .eq("id", course.id);

  ctx.job.state.hasTimestamps = hasTimestamps;
  ctx.job.state.warnings = [...(ctx.job.state.warnings ?? []), ...warnings];
  return { status: "completed", result: { segments: segments.length, hasTimestamps, lang, coverageRatio } };
}

/* ---------------------------------- analysis --------------------------------- */

export async function buildChunkPrompt(ctx: Ctx, index: number): Promise<Prompt> {
  const course = await getCourse(ctx);
  const cs = await chunks(ctx);
  const chunk = cs[index];
  if (!chunk) throw new FatalJobError(`Transcript chunk ${index} missing`);
  return {
    system: SYSTEM_ANALYZE_CHUNK,
    content: text(`Video: "${course.original_video_title ?? course.title}" by ${course.channel_name ?? "unknown channel"}.
This is window ${index + 1} of ${cs.length} of the full transcript${
      hasTs(ctx) ? ` (from ${Math.round(chunk.start)}s to ${Math.round(chunk.end)}s)` : ""
    }. Earlier and later windows are analysed separately — extract every teaching point in THIS window.

<transcript_window>
${chunk.text}
</transcript_window>`),
  };
}

export async function applyChunkAnalysis(ctx: Ctx, index: number, data: ChunkAnalysis) {
  const cs = await chunks(ctx);
  const chunk = cs[index];
  if (!chunk) throw new FatalJobError(`Transcript chunk ${index} missing`);
  // local ids must be unique within the chunk so global ids are stable.
  const seen = new Set<string>();
  for (const p of data.points) {
    if (seen.has(p.local_id)) throw new Error(`Duplicate local_id "${p.local_id}" — each point needs a unique id.`);
    seen.add(p.local_id);
  }
  if (!data.points.length && chunk.text.length > 400) {
    await ctx.log("warn", `No teaching points extracted from window ${index + 1}`);
  }
  return { chunk: index, analysis: data };
}

export async function buildFramePrompt(ctx: Ctx, frameId: string): Promise<Prompt | null> {
  const { data: frame } = await ctx.db.from("video_frames").select("*").eq("id", frameId).maybeSingle();
  if (!frame) return null;
  const { data: file, error } = await ctx.db.storage.from("uploads").download(frame.storage_path);
  if (error || !file) return null;
  const mediaType = (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
    ? file.type
    : "image/png") as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return {
    system: SYSTEM_ANALYZE_FRAME,
    content: [
      { type: "image", mediaType, base64 },
      {
        type: "text",
        text: `Frame captured at ${frame.timestamp_seconds ?? "an unspecified time"} seconds.${
          frame.caption ? ` Learner's note: ${frame.caption}` : ""
        } Describe it for course authors.`,
      },
    ],
  };
}

export async function applyFrameAnalysis(ctx: Ctx, frameId: string, data: FrameAnalysis) {
  await ctx.db.from("video_frames").update({ analysis: data }).eq("id", frameId).eq("course_id", ctx.job.course_id);
  const course = await getCourse(ctx);
  await ctx.db
    .from("courses")
    .update({ coverage: { ...(course.coverage ?? {}), visual_analysis: "transcript_and_user_frames" } })
    .eq("id", ctx.job.course_id);
  return { frameId };
}

/* ---------------------------- objectives / overview -------------------------- */

export async function buildOverviewPrompt(ctx: Ctx): Promise<Prompt> {
  const course = await getCourse(ctx);
  ctx.memo.delete("inventory");
  const { points } = await loadInventory(ctx);
  if (!points.length) throw new FatalJobError("No teaching content could be identified in this video's transcript.");
  const frames = await frameNotes(ctx);
  return {
    system: SYSTEM_OVERVIEW,
    content: text(`Video title: ${course.original_video_title}
Channel: ${course.channel_name}
Video description: ${(course.video_description ?? "n/a").slice(0, 3000)}

Complete inventory of ${points.length} teaching points (in video order):
${points.map((p) => `${pointLine(p)} — ${p.detail.slice(0, 280)}`).join("\n")}
${frames.length ? `\nLearner-supplied frame analyses:\n${frames.join("\n")}` : ""}`),
  };
}

export async function applyOverview(ctx: Ctx, data: CourseOverview) {
  await ctx.db
    .from("courses")
    .update({
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      difficulty: data.difficulty,
      target_audience: data.target_audience,
      prerequisites: data.prerequisites,
      learning_objectives: data.learning_objectives,
    })
    .eq("id", ctx.job.course_id);
  ctx.memo.delete("inventory");
  return { overview: data };
}

/* --------------------------------- curriculum -------------------------------- */

export async function buildCurriculumPrompt(ctx: Ctx): Promise<Prompt> {
  const course = await getCourse(ctx);
  const { points, duplicates } = await loadInventory(ctx);
  const required = points.filter((p) => !duplicates.has(p.id));
  const aiSettings = await getSetting("ai");
  return {
    system: SYSTEM_CURRICULUM,
    content: text(`Course: ${course.title}
Subtitle: ${course.subtitle ?? ""}
Learning objectives: ${((course.learning_objectives ?? []) as string[]).join("; ")}
Maximum lessons: ${aiSettings.max_lessons_per_course}

Teaching points to organise (ALL must be assigned):
${required.map((p) => `${pointLine(p)}${p.parent_local_id ? ` (part of ${p.parent_local_id})` : ""}`).join("\n")}`),
  };
}

/**
 * Validates coverage and persists modules + lessons (replacing any previous
 * structure). `strict` rejects answers that leave points unassigned so the
 * caller can ask for a corrected version; otherwise missing points are
 * assigned to the lesson nearest in time.
 */
export async function applyCurriculum(ctx: Ctx, data: Curriculum, opts: { strict: boolean }) {
  const course = await getCourse(ctx);
  const { points, duplicates } = await loadInventory(ctx);
  const required = points.filter((p) => !duplicates.has(p.id));
  const aiSettings = await getSetting("ai");

  const valid = new Set(required.map((p) => p.id));
  const assigned = new Set<string>();
  const lessons = data.modules.flatMap((m) => m.lessons);
  if (!lessons.length) throw new Error("The curriculum has no lessons.");
  if (lessons.length > aiSettings.max_lessons_per_course) {
    throw new Error(`Too many lessons (${lessons.length}); the maximum is ${aiSettings.max_lessons_per_course}. Merge closely related lessons.`);
  }
  for (const l of lessons) {
    l.point_ids = l.point_ids.filter((id) => valid.has(id) || duplicates.has(id));
    l.point_ids.forEach((id) => assigned.add(id));
  }
  const missing = required.filter((p) => !assigned.has(p.id));
  if (missing.length && opts.strict) {
    throw new CoverageError(
      missing.map((p) => ({ id: p.id, title: p.title })),
      `${missing.length} teaching point(s) are not assigned to any lesson. Assign every one and resubmit.`,
    );
  }
  for (const p of missing) {
    const t = p.start_seconds ?? 0;
    let best = lessons[0];
    let bestDist = Infinity;
    for (const l of lessons) {
      const s = l.start_seconds ?? 0;
      const e = l.end_seconds ?? s;
      const dist = t >= s && t <= e ? 0 : Math.min(Math.abs(t - s), Math.abs(t - e));
      if (dist < bestDist) {
        best = l;
        bestDist = dist;
      }
    }
    best.point_ids.push(p.id);
  }
  if (missing.length) {
    await ctx.log("warn", `Curriculum missed ${missing.length} teaching point(s); assigned them to the nearest lessons.`, {
      missing: missing.map((p) => p.id),
    });
  }
  const modules = data.modules.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.title.trim()) })).filter((m) => m.lessons.length);
  if (!modules.length) throw new FatalJobError("The curriculum could not be generated.");

  await ctx.db.from("course_modules").delete().eq("course_id", course.id);
  const lessonIds: string[] = [];
  for (const [mi, m] of modules.entries()) {
    const { data: mod, error } = await ctx.db
      .from("course_modules")
      .insert({ course_id: course.id, title: m.title, description: m.description, position: mi })
      .select("id")
      .single();
    if (error || !mod) throw error ?? new Error("module insert failed");
    const rows = m.lessons.map((l, li) => {
      const pts = l.point_ids.map((id) => points.find((p) => p.id === id)).filter(Boolean) as Point[];
      const starts = pts.map((p) => p.start_seconds).filter((x): x is number => x != null);
      const ends = pts.map((p) => p.end_seconds ?? p.start_seconds).filter((x): x is number => x != null);
      return {
        module_id: mod.id,
        course_id: course.id,
        title: l.title,
        description: l.description,
        learning_objectives: l.learning_objectives,
        covered_point_ids: l.point_ids,
        original_timestamp_start: Math.floor(l.start_seconds ?? (starts.length ? Math.min(...starts) : 0)),
        original_timestamp_end: Math.ceil(l.end_seconds ?? (ends.length ? Math.max(...ends) : 0)),
        position: li,
        generation_status: "pending",
      };
    });
    const { data: inserted, error: lerr } = await ctx.db.from("lessons").insert(rows).select("id");
    if (lerr) throw lerr;
    lessonIds.push(...(inserted ?? []).map((r) => r.id));
  }
  return { modules: modules.length, lessons: lessonIds.length, missingAssigned: missing.length };
}

/* ---------------------------------- lessons ---------------------------------- */

export async function buildLessonPrompt(ctx: Ctx, lessonId: string, reminder = ""): Promise<(Prompt & { assignedIds: string[]; title: string }) | null> {
  const course = await getCourse(ctx);
  const all = await orderedLessons(ctx);
  const lesson = all.find((l) => l.id === lessonId);
  if (!lesson) return null;
  const { points } = await loadInventory(ctx);
  const assigned = lesson.covered_point_ids.map((id) => points.find((p) => p.id === id)).filter(Boolean) as Point[];
  const segs = await loadSegments(ctx);
  const ts = hasTs(ctx) && segs.some((s) => s.end > 0);
  const start = lesson.original_timestamp_start ?? 0;
  const end = lesson.original_timestamp_end ?? start;
  const excerpt = ts ? transcriptSlice(segs, start, end, 20) : [];
  const frames = await frameNotes(ctx, start, end);
  const idx = all.findIndex((l) => l.id === lessonId);
  const outline = all.map((l, i) => `${i === idx ? "→ " : "  "}${l.course_modules.title} / ${l.title}`).join("\n");
  const extra = ctx.job.input.instructions ? `\nAuthor's regeneration request: ${ctx.job.input.instructions}` : "";

  return {
    title: lesson.title,
    assignedIds: assigned.map((p) => p.id),
    system: SYSTEM_LESSON,
    content: text(`Course: ${course.title}
Audience: ${course.target_audience ?? "general"} · Difficulty: ${course.difficulty ?? "beginner"}

Course outline (current lesson marked →):
${outline}

Write lesson: "${lesson.title}" — ${lesson.description ?? ""}

Assigned teaching points (teach ALL of them; ids for covered_point_ids):
${assigned.map((p) => pointLine(p, true)).join("\n\n") || "(none listed — teach the transcript excerpt)"}

${excerpt.length ? `Transcript excerpt for this lesson (${start}s–${end}s):\n<transcript>\n${renderSegments(excerpt, true)}\n</transcript>` : ""}
${frames.length ? `\nLearner-supplied frame analyses (actual on-screen content):\n${frames.join("\n")}` : ""}
${extra}${reminder}`),
  };
}

/** Assigned point ids the lesson did not report teaching. */
export async function lessonMissingPoints(ctx: Ctx, lessonId: string, data: LessonContent) {
  const brief = await buildLessonPrompt(ctx, lessonId);
  return (brief?.assignedIds ?? []).filter((id) => !data.covered_point_ids.includes(id));
}

export async function applyLesson(ctx: Ctx, lessonId: string, data: LessonContent, opts: { strict: boolean }) {
  const { data: lesson } = await ctx.db
    .from("lessons")
    .select("id, title, covered_point_ids, original_timestamp_start, original_timestamp_end")
    .eq("id", lessonId)
    .eq("course_id", ctx.job.course_id)
    .maybeSingle();
  if (!lesson) throw new Error("Lesson not found in this course.");
  const { points } = await loadInventory(ctx);
  const assigned = (lesson.covered_point_ids as string[]).map((id) => points.find((p) => p.id === id)).filter(Boolean) as Point[];
  const missing = assigned.filter((p) => !data.covered_point_ids.includes(p.id));
  if (missing.length && opts.strict) {
    throw new CoverageError(
      missing.map((p) => ({ id: p.id, title: p.title })),
      `The lesson does not teach ${missing.length} assigned point(s). Teach each one fully and include its id in covered_point_ids, then resubmit.`,
    );
  }

  const flags: { severity: string; issue: string }[] = [];
  if (missing.length) flags.push({ severity: "warning", issue: `May not fully cover: ${missing.map((p) => p.title).join("; ")}` });
  const frames = await frameNotes(ctx, lesson.original_timestamp_start, lesson.original_timestamp_end);
  const visualPts = assigned.filter((p) => p.visual_dependency === "essential");
  if (visualPts.length && !frames.length) {
    flags.push({
      severity: "info",
      issue: `Parts of this lesson depend on on-screen content that the transcript does not capture (${visualPts
        .map((p) => p.title)
        .join("; ")}). Watch the referenced timestamps or add screenshots.`,
    });
  }

  await ctx.db
    .from("lessons")
    .update({
      content: { ...data, version: 1 },
      learning_objectives: data.learning_objectives,
      estimated_reading_time: Math.max(3, Math.round(data.estimated_reading_minutes)),
      generation_status: "generated",
      quality_flags: flags,
    })
    .eq("id", lessonId);
  return { lessonId, missing: missing.map((p) => p.id) };
}

async function taskLesson(task: TaskRow, ctx: Ctx): Promise<TaskOutcome> {
  const lessonId = String(task.payload.lessonId);
  const brief = await buildLessonPrompt(ctx, lessonId);
  if (!brief) return { status: "skipped", result: { reason: "lesson deleted" } };
  let data = await generate(ctx, "generate_lesson", brief, LessonContent, 48000);
  const missing = brief.assignedIds.filter((id) => !data.covered_point_ids.includes(id));
  if (missing.length) {
    await ctx.log("info", `Lesson "${brief.title}" missed ${missing.length} point(s); regenerating once.`);
    const retry = await buildLessonPrompt(
      ctx,
      lessonId,
      `\n\nIMPORTANT: a previous draft failed to teach these points: ${missing.join(", ")}. Teach every assigned point fully this time.`,
    );
    data = await generate(ctx, "generate_lesson_retry", retry!, LessonContent, 48000);
  }
  return { status: "completed", result: await applyLesson(ctx, lessonId, data, { strict: false }) };
}

/* -------------------------------- illustrations ------------------------------ */

export async function buildIllustrationsPrompt(ctx: Ctx, lessonId: string): Promise<Prompt | null> {
  const { data: lesson } = await ctx.db.from("lessons").select("*").eq("id", lessonId).eq("course_id", ctx.job.course_id).maybeSingle();
  if (!lesson || lesson.generation_status !== "generated") return null;
  const content = lesson.content as LessonContent;
  return {
    system: SYSTEM_ILLUSTRATIONS,
    content: text(`Lesson: ${lesson.title}
Source range: ${lesson.original_timestamp_start ?? "?"}s–${lesson.original_timestamp_end ?? "?"}s

Introduction: ${content.introduction}

Explanations:
${content.explanation_sections.map((s) => `## ${s.heading}\n${s.body}`).join("\n\n")}

Steps:
${content.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.instruction}${s.command ? ` [${s.command}]` : ""}${s.timestamp_seconds != null ? ` @${s.timestamp_seconds}s` : ""}`).join("\n")}

Code examples:
${content.code_examples.map((c) => `${c.title} (${c.language}):\n${c.code}`).join("\n\n")}

Visual gaps: ${content.visual_gaps.join("; ") || "none"}
${ctx.job.input.instructions ? `\nAuthor's request: ${ctx.job.input.instructions}` : ""}`),
  };
}

export async function applyIllustrations(ctx: Ctx, lessonId: string, data: IllustrationSet) {
  const { data: lesson } = await ctx.db
    .from("lessons")
    .select("id, original_timestamp_start, original_timestamp_end")
    .eq("id", lessonId)
    .eq("course_id", ctx.job.course_id)
    .maybeSingle();
  if (!lesson) throw new Error("Lesson not found in this course.");

  // Replace previous generated illustrations (keep the author's own uploads).
  await ctx.db.from("lesson_illustrations").delete().eq("lesson_id", lessonId).in("source", ["ai_diagram", "ai_image", "video_frame"]);

  const aiSettings = await getSetting("ai");
  let imageBudget = aiSettings.image_generation && imageProviderConfigured() ? 1 : 0;
  const rows: Record<string, unknown>[] = [];
  for (const [i, ill] of data.illustrations.entries()) {
    let imageUrl: string | null = null;
    let storagePath: string | null = null;
    if (ill.image_prompt && imageBudget > 0) {
      imageBudget--;
      try {
        const bytes = await generateConceptImage(ill.image_prompt);
        storagePath = `${ctx.job.course_id}/${lessonId}/${Date.now()}-${i}.png`;
        await ctx.db.storage.from("illustrations").upload(storagePath, bytes, { contentType: "image/png", upsert: true });
        imageUrl = ctx.db.storage.from("illustrations").getPublicUrl(storagePath).data.publicUrl;
      } catch (e) {
        await ctx.log("warn", "Concept image generation failed", { error: String(e) });
      }
    }
    rows.push({
      lesson_id: lessonId,
      course_id: ctx.job.course_id,
      image_type: ill.type,
      source: imageUrl ? "ai_image" : "ai_diagram",
      title: ill.title,
      description: ill.description,
      position: i,
      timestamp_seconds: ill.timestamp_seconds != null ? Math.round(ill.timestamp_seconds) : null,
      image_url: imageUrl,
      storage_path: storagePath,
      metadata: {
        explanation: ill.explanation,
        labels: ill.labels,
        mermaid: ill.mermaid,
        steps: ill.steps,
        comparison: ill.comparison,
        code: ill.code,
      },
    });
  }

  // Learner-supplied frames within this lesson's range become annotated video-frame illustrations.
  const { data: frames } = await ctx.db
    .from("video_frames")
    .select("*")
    .eq("course_id", ctx.job.course_id)
    .not("analysis", "is", null);
  const s = lesson.original_timestamp_start ?? -1;
  const e = lesson.original_timestamp_end ?? -1;
  for (const f of frames ?? []) {
    if (f.timestamp_seconds == null || f.timestamp_seconds < s - 5 || f.timestamp_seconds > e + 5) continue;
    const a = f.analysis as FrameAnalysis;
    rows.push({
      lesson_id: lessonId,
      course_id: ctx.job.course_id,
      image_type: "video_frame",
      source: "video_frame",
      title: a.title,
      description: a.description,
      position: 100 + rows.length,
      timestamp_seconds: f.timestamp_seconds,
      storage_path: f.storage_path,
      metadata: {
        bucket: "uploads",
        explanation: a.teaching_relevance,
        labels: a.ui_elements.map((u) => `${u.label}: ${u.purpose}`),
        visible_text: a.visible_text,
      },
    });
  }
  if (rows.length) {
    const { error } = await ctx.db.from("lesson_illustrations").insert(rows);
    if (error) throw error;
  }
  return { count: rows.length };
}

/* --------------------------------- assessments ------------------------------- */

function lessonDigest(l: { id: string; title: string; content: LessonContent }) {
  const c = l.content;
  return `<lesson id="${l.id}" title="${l.title}">
${c.explanation_sections.map((s) => `## ${s.heading}\n${s.body}`).join("\n")}
${c.steps.length ? `Steps:\n${c.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.instruction}`).join("\n")}` : ""}
Key takeaways: ${c.key_takeaways.join("; ")}
</lesson>`;
}

async function quizLessons(ctx: Ctx, moduleId?: string) {
  let q = ctx.db
    .from("lessons")
    .select("id, title, content, module_id, generation_status")
    .eq("course_id", ctx.job.course_id)
    .eq("generation_status", "generated");
  if (moduleId) q = q.eq("module_id", moduleId);
  const { data } = await q;
  return (data ?? []) as { id: string; title: string; content: LessonContent }[];
}

export async function buildQuizPrompt(
  ctx: Ctx,
  payload: Record<string, unknown>,
): Promise<{ prompt: Prompt; isFinal: boolean; lessonIds: string[] } | null> {
  const course = await getCourse(ctx);
  const isFinal = Boolean(payload.final);
  const moduleId = payload.moduleId as string | undefined;
  const lessons = await quizLessons(ctx, moduleId);
  if (!lessons.length) return null;
  const { data: mod } = moduleId
    ? await ctx.db.from("course_modules").select("title").eq("id", moduleId).single()
    : { data: null };
  const digest = lessons.map(lessonDigest);
  return {
    isFinal,
    lessonIds: lessons.map((l) => l.id),
    prompt: {
      system: SYSTEM_QUIZ,
      content: text(`${
        isFinal
          ? `Write the FINAL ASSESSMENT for the course "${course.title}": 12–20 questions spanning every module, including at least one practical exercise if the course is hands-on.`
          : `Write a quiz for module "${mod?.title}": 5–8 questions.`
      }
Valid lesson ids: ${lessons.map((l) => l.id).join(", ")}

${digest.join("\n\n").slice(0, isFinal ? 400_000 : 200_000)}`),
    },
  };
}

export async function applyQuiz(ctx: Ctx, payload: Record<string, unknown>, data: QuizSpec) {
  const course = await getCourse(ctx);
  const completion = await getSetting("completion");
  const passing =
    Number((course.completion_settings as Record<string, unknown>)?.passing_score) || completion.default_passing_score;
  const isFinal = Boolean(payload.final);
  const moduleId = payload.moduleId as string | undefined;
  const lessons = await quizLessons(ctx, moduleId);
  const lessonIds = new Set(lessons.map((l) => l.id));

  const questions = data.questions
    .map((qq) => {
      if (qq.type === "true_false") qq.options = ["True", "False"];
      if (qq.type === "multiple_choice" || qq.type === "true_false") {
        const match = qq.options.find((o) => o.trim().toLowerCase() === qq.correct_answer.trim().toLowerCase());
        if (!match) return null;
        qq.correct_answer = match;
      } else {
        qq.options = [];
      }
      return qq;
    })
    .filter(Boolean) as QuizSpec["questions"];
  if (!questions.length) {
    throw new Error("No valid questions: for choice questions correct_answer must exactly match one of the options.");
  }

  if (isFinal) await ctx.db.from("quizzes").delete().eq("course_id", course.id).eq("kind", "final");
  else await ctx.db.from("quizzes").delete().eq("module_id", moduleId!);
  const { data: quiz, error } = await ctx.db
    .from("quizzes")
    .insert({
      course_id: course.id,
      module_id: isFinal ? null : moduleId,
      kind: isFinal ? "final" : "module",
      title: data.title,
      description: data.description,
      passing_score: passing,
    })
    .select("id")
    .single();
  if (error || !quiz) throw error ?? new Error("quiz insert failed");
  const { error: qerr } = await ctx.db.from("quiz_questions").insert(
    questions.map((qq, i) => ({
      quiz_id: quiz.id,
      lesson_id: lessonIds.has(qq.lesson_id) ? qq.lesson_id : null,
      question: qq.question,
      question_type: qq.type,
      options: qq.options,
      correct_answer: qq.correct_answer,
      explanation: qq.explanation,
      position: i,
    })),
  );
  if (qerr) throw qerr;
  return { quizId: quiz.id, questions: questions.length, dropped: data.questions.length - questions.length };
}

/* ---------------------------------- quality ---------------------------------- */

type LessonRowQA = {
  id: string;
  title: string;
  content: LessonContent;
  covered_point_ids: string[];
  generation_status: string;
  quality_flags: { severity: string; issue: string }[];
};

async function programmaticQA(ctx: Ctx) {
  const { points, duplicates } = await loadInventory(ctx);
  const required = points.filter((p) => !duplicates.has(p.id));
  const { data } = await ctx.db
    .from("lessons")
    .select("id, title, content, covered_point_ids, generation_status, quality_flags")
    .eq("course_id", ctx.job.course_id);
  const rows = (data ?? []) as LessonRowQA[];
  const taught = new Set<string>();
  for (const l of rows) {
    if (l.generation_status !== "generated") continue;
    for (const id of l.content.covered_point_ids ?? []) taught.add(id);
  }
  const uncovered = required.filter((p) => !taught.has(p.id));
  const failedLessons = rows.filter((l) => l.generation_status !== "generated");
  const demoIds = new Set(required.filter((p) => p.kind === "demonstration" || p.kind === "instruction").map((p) => p.id));
  const demoLessonsWithoutSteps = rows.filter(
    (l) => l.generation_status === "generated" && l.covered_point_ids.some((id) => demoIds.has(id)) && (l.content.steps ?? []).length === 0,
  );
  const { count: quizCount } = await ctx.db
    .from("quizzes")
    .select("id", { count: "exact", head: true })
    .eq("course_id", ctx.job.course_id);
  return { required, rows, uncovered, failedLessons, demoLessonsWithoutSteps, quizCount: quizCount ?? 0 };
}

export async function buildQualityPrompt(ctx: Ctx): Promise<{ prompt: Prompt }> {
  const f = await programmaticQA(ctx);
  return {
    prompt: {
      system: SYSTEM_QUALITY,
      content: text(`Source teaching-point inventory (${f.required.length} points):
${f.required.map((p) => pointLine(p)).join("\n")}

Generated lessons:
${f.rows
  .map(
    (l) => `<lesson id="${l.id}" title="${l.title}" status="${l.generation_status}">
covers: ${(l.content.covered_point_ids ?? []).join(", ")}
sections: ${(l.content.explanation_sections ?? []).map((s) => s.heading).join(" | ")}
steps: ${(l.content.steps ?? []).length}, examples: ${(l.content.examples ?? []).length} (${(l.content.examples ?? []).filter((e) => e.source === "supplementary").length} supplementary), code: ${(l.content.code_examples ?? []).length}
first section excerpt: ${(l.content.explanation_sections?.[0]?.body ?? "").slice(0, 600)}
</lesson>`,
  )
  .join("\n")}

Programmatic findings: ${f.uncovered.length} uncovered points (${f.uncovered.map((p) => p.id).join(", ") || "none"}); ${f.failedLessons.length} lessons failed generation; ${f.demoLessonsWithoutSteps.length} demonstration lessons without step-by-step instructions; ${f.quizCount} quizzes.`),
    },
  };
}

/** Combines the reviewer's findings with the programmatic coverage checklist. */
export async function applyQuality(ctx: Ctx, review: QualityReview) {
  const f = await programmaticQA(ctx);
  for (const issue of review.lesson_issues) {
    const l = f.rows.find((r) => r.id === issue.lesson_id);
    if (!l) continue;
    l.quality_flags = [...(l.quality_flags ?? []), { severity: issue.severity, issue: issue.issue }];
    await ctx.db.from("lessons").update({ quality_flags: l.quality_flags }).eq("id", l.id);
  }
  for (const l of f.demoLessonsWithoutSteps) {
    await ctx.db
      .from("lessons")
      .update({
        quality_flags: [...(l.quality_flags ?? []), { severity: "warning", issue: "Covers a demonstration but has no step-by-step instructions." }],
      })
      .eq("id", l.id);
  }
  const coverageRatio = f.required.length ? (f.required.length - f.uncovered.length) / f.required.length : 1;
  const critical = review.lesson_issues.filter((i) => i.severity === "critical").length;
  const report = {
    generated_at: new Date().toISOString(),
    engine: ctx.job.job_type === "assistant_generate" ? "assistant" : "server",
    teaching_points: f.required.length,
    covered_points: f.required.length - f.uncovered.length,
    coverage_ratio: coverageRatio,
    uncovered: f.uncovered.map((p) => ({ id: p.id, title: p.title, start_seconds: p.start_seconds })),
    failed_lessons: f.failedLessons.map((l) => ({ id: l.id, title: l.title })),
    demonstration_lessons_without_steps: f.demoLessonsWithoutSteps.map((l) => l.id),
    visual_dependent_points: f.required.filter((p) => p.visual_dependency === "essential").length,
    ai_review: review,
    passed: coverageRatio >= 0.98 && f.failedLessons.length === 0 && critical === 0,
  };
  await ctx.db.from("courses").update({ quality_report: report }).eq("id", ctx.job.course_id);
  return { passed: report.passed, coverage: coverageRatio };
}

/* ---------------------------------- finalize --------------------------------- */

export async function taskFinalize(ctx: Ctx): Promise<TaskOutcome> {
  const course = await getCourse(ctx);
  const { data: lessons } = await ctx.db
    .from("lessons")
    .select("estimated_reading_time, generation_status")
    .eq("course_id", course.id);
  const minutes = (lessons ?? []).reduce((m, l) => m + (l.estimated_reading_time ?? 0), 0);
  const quizMinutes = 10 * (((lessons ?? []).length > 0 ? 1 : 0) + 1);
  const warnings = new Set<string>([...((course.processing_warnings as string[]) ?? []), ...(ctx.job.state.warnings ?? [])]);

  const coverage = (course.coverage ?? {}) as Record<string, unknown>;
  if (coverage.visual_analysis === "transcript_only") {
    warnings.add(
      "This course was generated from the video's transcript. On-screen visuals (slides, code on screen, UI clicks) were not analysed unless you added screenshots; lessons flag places where the video relies on visuals.",
    );
  }
  const report = (course.quality_report ?? {}) as { passed?: boolean; coverage_ratio?: number };
  if (SOURCE_JOB_TYPES.includes(ctx.job.job_type) && report.passed === false) {
    warnings.add(
      `Quality verification flagged issues (coverage ${Math.round((report.coverage_ratio ?? 0) * 100)}% of identified teaching points). Review the flagged lessons.`,
    );
  }
  const failed = (lessons ?? []).filter((l) => l.generation_status !== "generated").length;
  const status = failed > 0 || report.passed === false ? "needs_review" : "ready";

  await ctx.db
    .from("courses")
    .update({ status, estimated_duration: minutes + quizMinutes, processing_warnings: [...warnings] })
    .eq("id", course.id);
  return { status: "completed", result: { status, minutes } };
}
