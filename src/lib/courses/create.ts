import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVideoMetadata, VideoNotFoundError, type VideoMetadata } from "@/lib/youtube/metadata";
import { canonicalWatchUrl, parseYouTubeUrl } from "@/lib/youtube/url";
import { normalizeSegments, parseTranscriptFile } from "@/lib/transcript/parse";
import { transcriptProviderConfigured } from "@/lib/transcript/providers";
import { aiConfigured } from "@/lib/ai/provider";
import {
  MAX_DOCUMENT_MB,
  SourceError,
  assertPublicUrl,
  extractArticle,
  extractDocument,
  extractDocumentFromUrl,
  fetchPublicImage,
  type ExtractedSource,
} from "@/lib/sources/extract";

export const SOURCE_TYPES = ["youtube", "video_upload", "document", "article", "prompt"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CreateCourseInput = z.object({
  sourceType: z.enum(SOURCE_TYPES).default("youtube"),
  url: z.string().default(""), // YouTube URL (youtube) or article URL (article)
  title: z.string().trim().max(200).optional(), // optional title for uploads
  engine: z.enum(["server", "assistant"]).default("server"),
  transcriptSource: z.enum(["captions", "ai_transcription", "media_upload", "manual"]).default("captions"),
  documentPath: z.string().optional(), // uploads/<uid>/... for document
  documentUrl: z.string().max(2000).optional(), // public PDF/DOCX/TXT link (document)
  documentText: z.string().max(1_500_000).optional(), // pasted/extracted text (document, e.g. via MCP)
  documentName: z.string().max(200).optional(),
  mediaUrl: z.string().max(2000).optional(), // public audio/video link (video_upload)
  transcriptText: z.string().max(5_000_000).optional(), // pasted transcript (youtube + manual)
  prompt: z.string().trim().max(8000).optional(), // course brief (prompt)
  level: z.enum(["beginner", "intermediate", "advanced", "any"]).default("any"),
  depth: z.enum(["short", "standard", "comprehensive"]).default("standard"),
  transcriptPath: z.string().optional(), // uploads/<uid>/... for manual
  mediaPath: z.string().optional(), // uploads/<uid>/... for media_upload
  lang: z.string().trim().max(40).optional(),
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
  if (data.sourceType !== "youtube") return createFromOtherSource(userId, data);

  const yt = parseYouTubeUrl(data.url);
  if (!yt) return { ok: false, error: "Invalid YouTube URL. Use a youtube.com/watch, youtu.be or Shorts link." };
  if (data.transcriptSource !== "manual" && data.transcriptSource !== "media_upload" && !transcriptProviderConfigured()) {
    return { ok: false, error: "Automatic transcripts are not configured on this server. Upload a transcript file instead (web app)." };
  }
  if (data.transcriptSource === "media_upload" && !transcriptProviderConfigured()) {
    return { ok: false, error: "Media transcription is not configured on this server." };
  }
  if (data.transcriptSource === "manual" && !data.transcriptText?.trim() && !ownPath(userId, data.transcriptPath)) {
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
    let text = data.transcriptText ?? "";
    if (!text.trim()) {
      const { data: file, error } = await db.storage.from("uploads").download(data.transcriptPath!);
      if (error || !file) return { ok: false, error: "Could not read the uploaded transcript." };
      text = await file.text();
    }
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

/* -------------------------------------------------------------------------- */
/* Uploaded video/audio, documents and article links                           */
/* -------------------------------------------------------------------------- */

async function activeJobCount(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { count } = await db
    .from("course_generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running", "waiting"]);
  return count ?? 0;
}

function fileNameOf(path: string) {
  return (path.split("/").pop() ?? path).replace(/^[0-9a-f-]{36}-/i, "");
}

/** A short working title from the first sentence of a brief (the AI writes the final one). */
function briefTitle(brief: string) {
  const first = brief.split(/(?<=[.!?])\s|\n/)[0].replace(/^(please\s+)?(create|make|build|write|generate|design)\s+(me\s+)?(a|an)?\s*(complete\s+)?(course|class|training)\s+(on|about|for)\s+/i, "");
  const t = first.trim().replace(/[.!?]+$/, "");
  const short = t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t;
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : "New course";
}

function titleFromName(name: string) {
  const t = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

async function createFromOtherSource(
  userId: string,
  data: z.output<typeof CreateCourseInput>,
): Promise<Result<{ courseId: string; jobId: string; engine: "server" | "assistant" }>> {
  const db = createAdminClient();
  if ((await activeJobCount(db, userId)) >= MAX_ACTIVE_JOBS) {
    return { ok: false, error: `You already have ${MAX_ACTIVE_JOBS} courses generating. Finish or cancel one first.` };
  }

  let extracted: (ExtractedSource & { finalUrl?: string }) | null = null;
  let sourceName: string | null = null;
  let sourceUrl: string | null = null;
  let mediaUrl: string | null = null;
  let promptTitle: string | null = null;
  let transcriptSource: "media_upload" | "document" | "article" | "prompt";

  try {
    if (data.sourceType === "prompt") {
      const brief = data.prompt?.trim() ?? "";
      if (brief.length < 20) return { ok: false, error: "Describe the course you want in at least a sentence or two (20+ characters)." };
      if (data.engine === "server" && !aiConfigured()) return { ok: false, error: "The built-in AI engine is not configured." };
      const lines = [
        `What the creator wants:\n${brief}`,
        data.title ? `Working title: ${data.title}` : null,
        `Learner level: ${data.level === "any" ? "not specified — pick the level the brief implies" : data.level}`,
        `Depth: ${data.depth} (${{ short: "a focused mini-course", standard: "a solid, complete course", comprehensive: "an in-depth, extensive course" }[data.depth]})`,
        data.lang ? `Write the entire course in this language: ${data.lang}` : null,
      ].filter(Boolean);
      extracted = { title: null, segments: [{ start: 0, end: 0, text: lines.join("\n\n") }], characters: brief.length };
      promptTitle = data.title || briefTitle(brief);
      transcriptSource = "prompt";
    } else if (data.sourceType === "video_upload") {
      if (!transcriptProviderConfigured()) return { ok: false, error: "Video transcription is not configured on this server." };
      if (data.mediaUrl?.trim()) {
        const u = await assertPublicUrl(data.mediaUrl.trim());
        mediaUrl = u.toString();
        sourceUrl = mediaUrl;
        sourceName = decodeURIComponent(u.pathname.split("/").pop() || u.hostname);
      } else {
        if (!ownPath(userId, data.mediaPath)) return { ok: false, error: "Upload a video or audio file first." };
        sourceName = fileNameOf(data.mediaPath!);
      }
      transcriptSource = "media_upload";
    } else if (data.sourceType === "document" && data.documentUrl?.trim()) {
      const doc = await extractDocumentFromUrl(data.documentUrl.trim());
      extracted = doc;
      sourceName = doc.fileName;
      sourceUrl = data.documentUrl.trim();
      transcriptSource = "document";
    } else if (data.sourceType === "document" && data.documentText?.trim()) {
      const raw = (data.documentName?.trim() || "document").replace(/[^\w .-]/g, "_").slice(0, 120);
      sourceName = /\.(md|markdown)$/i.test(raw) ? raw : `${raw.replace(/\.[a-z0-9]+$/i, "")}.txt`;
      extracted = await extractDocument(new TextEncoder().encode(data.documentText), sourceName);
      if (data.documentName) extracted.title = extracted.title ?? titleFromName(data.documentName);
      transcriptSource = "document";
    } else if (data.sourceType === "document") {
      if (!ownPath(userId, data.documentPath)) return { ok: false, error: "Upload a document first." };
      const { data: file, error } = await db.storage.from("uploads").download(data.documentPath!);
      if (error || !file) return { ok: false, error: "Could not read the uploaded document." };
      if (file.size > MAX_DOCUMENT_MB * 1024 * 1024) return { ok: false, error: `Documents must be under ${MAX_DOCUMENT_MB} MB.` };
      sourceName = fileNameOf(data.documentPath!);
      extracted = await extractDocument(new Uint8Array(await file.arrayBuffer()), sourceName);
      transcriptSource = "document";
    } else {
      if (!data.url.trim()) return { ok: false, error: "Paste an article link first." };
      extracted = await extractArticle(data.url.trim());
      sourceName = extracted.siteName ?? null;
      transcriptSource = "article";
    }
  } catch (e) {
    if (e instanceof SourceError) return { ok: false, error: e.message };
    console.error("[create course: source]", e);
    return { ok: false, error: "We couldn't read that source. Please try a different file or link." };
  }

  const title =
    data.title ||
    promptTitle ||
    extracted?.title ||
    (data.sourceType === "video_upload" && sourceName ? titleFromName(sourceName) : null) ||
    "Untitled course";

  const { data: course, error: cerr } = await db
    .from("courses")
    .insert({
      user_id: userId,
      title,
      source_type: data.sourceType,
      source_url: data.sourceType === "article" ? (extracted?.finalUrl ?? data.url.trim()) : sourceUrl,
      source_name: sourceName,
      original_video_title: data.sourceType === "prompt" ? title : (extracted?.title ?? title),
      channel_name: extracted?.byline ?? (data.sourceType === "article" ? sourceName : null),
      video_description: extracted?.excerpt ?? null,
      status: "processing",
      transcript_source: transcriptSource,
      generation_engine: data.engine,
    })
    .select("id")
    .single();
  if (cerr || !course) {
    console.error("[create course]", cerr);
    return { ok: false, error: "Could not create the course." };
  }

  if (extracted) {
    const rows = extracted.segments.map((s, i) => ({ course_id: course.id, position: i, start_seconds: 0, end_seconds: 0, text: s.text }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("transcript_segments").insert(rows.slice(i, i + 500));
      if (error) {
        await db.from("courses").delete().eq("id", course.id);
        return { ok: false, error: "Could not store the source text." };
      }
    }
  }

  // Article cover image → public bucket (so it renders like any other thumbnail).
  if (extracted?.imageUrl) {
    const img = await fetchPublicImage(extracted.imageUrl);
    if (img) {
      const path = `thumbnails/${course.id}.${img.ext}`;
      const { error } = await db.storage.from("illustrations").upload(path, img.body, { contentType: img.contentType, upsert: true });
      if (!error) {
        const { data: pub } = db.storage.from("illustrations").getPublicUrl(path);
        await db.from("courses").update({ thumbnail_url: pub.publicUrl }).eq("id", course.id);
      }
    }
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
        transcriptSource,
        mediaPath: data.sourceType === "video_upload" && !mediaUrl ? data.mediaPath : null,
        mediaUrl,
        lang: data.lang ?? null,
        isShort: false,
        manualHasTimestamps: extracted ? false : null,
      },
    })
    .select("id")
    .single();
  if (jerr || !job) return { ok: false, error: "Could not start course generation." };
  return { ok: true, data: { courseId: course.id, jobId: job.id, engine: data.engine } };
}
