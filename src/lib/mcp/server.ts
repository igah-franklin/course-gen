import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { createCourseForUser, type CreateCourseInput } from "@/lib/courses/create";
import { aiConfigured } from "@/lib/ai/provider";
import { kickJob } from "@/lib/jobs/runner";
import { STAGE_LABELS, type StageKey } from "@/lib/jobs/stages";
import { transcriptProviderConfigured } from "@/lib/transcript/providers";
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
import { AssistantError, loadAssistantJob, nextStep, submitters, type NextStep, type SubmitResult } from "@/lib/assistant/engine";

/* ============================================================================
 * MCP server: lets a user's own Claude or ChatGPT generate courses.
 * One server instance per request (stateless Streamable HTTP), bound to the
 * user resolved from the OAuth bearer token.
 * ==========================================================================*/

const INSTRUCTIONS = `${publicEnv.appName} turns learning material into complete courses: lessons, illustrations, quizzes, a final assessment and a certificate. By default you (the assistant) do the writing; the server stores the course, validates every submission and tracks progress.

Ways to create a course (pick the tool that matches what the user gives you):
- create_course — a YouTube video link (optionally with a transcript the user pasted).
- create_course_from_prompt — no material, just a description of the course they want ("make me a course on…").
- create_course_from_article — a link to a blog post or web article.
- create_course_from_document — a PDF/DOCX/TXT/Markdown file. Pass a public link to the file, OR, if the user attached the file in this chat, read it and pass its complete text (do not summarise it).
- create_course_from_media — a public direct link to an audio or video file (not YouTube) to transcribe.

Each create tool takes writer: "me" (default — you write the course in this chat) or "platform" (the platform's own AI writes it in the background; check on it with get_course_status).

When you are the writer:
1. Each result tells you the next task: read its Instructions and Input, do the work yourself, then call the named submit_* tool with exactly the requested ids.
2. Every submit_* result contains the following task. Keep going until the course is done, without asking the user for confirmation between steps unless something fails.
3. If a submission is rejected, fix exactly what the error says and resubmit the same item.
4. If the conversation gets long, tell the user they can open a new chat and say "continue my course" — progress is saved on the server (list_courses / get_next_step).

Quality bar: for courses from source material, be faithful to it — cover every teaching point you are given, never invent facts presented as coming from the source, and label supplementary examples. For courses from a prompt, teach accurately from established knowledge and never invent citations, statistics or quotes.`;

const CourseId = z.guid().describe("Course id returned by create_course / list_courses");

function render(step: NextStep, prefix = ""): CallToolResult {
  const head = prefix ? `${prefix}\n\n` : "";
  if (step.kind === "failed") {
    return { isError: true, content: [{ type: "text", text: `${head}Course generation failed: ${step.error}` }] };
  }
  const prog = `Progress: ${step.progress.percent}% (${step.progress.completed_tasks}/${step.progress.total_tasks} tasks) · Stage: ${step.progress.stage}`;
  if (step.kind === "done") {
    return {
      content: [
        {
          type: "text",
          text: `${head}✅ Course complete: "${step.title}" (status: ${step.status}).\nOpen it: ${step.courseUrl}\n\nTell the user the course is ready and share the link.`,
        },
      ],
    };
  }
  if (step.kind === "wait") {
    return {
      content: [
        {
          type: "text",
          text: `${head}${prog}\n\n⏳ ${step.reason} Wait about ${step.retryAfterSeconds} seconds, then call get_next_step with course_id="${step.courseId}".`,
        },
      ],
    };
  }
  const args = Object.entries({ course_id: step.courseId, ...step.args })
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  const content: CallToolResult["content"] = [
    {
      type: "text",
      text: `${head}${prog}

## Next task: ${step.title}
When done, call \`${step.tool}\` with ${args} and your result.

### Instructions
${step.prompt.system}

### Input`,
    },
  ];
  for (const part of step.prompt.content) {
    if (part.type === "text") content.push({ type: "text", text: part.text });
    else content.push({ type: "image", data: part.base64, mimeType: part.mediaType });
  }
  return { content };
}

function renderSubmit(res: SubmitResult): CallToolResult {
  if (res.ok) return render(res.next, res.note ? `Saved. ${res.note}` : "Saved ✓");
  const missing = res.missing?.length
    ? `\n\nNot covered:\n${res.missing.map((m) => `- ${m.id}: ${m.title}`).join("\n")}`
    : "";
  const later = res.acceptedNextTime ? "\n\n(If it is genuinely impossible to cover these, resubmit as-is: the next attempt will be saved and flagged for review.)" : "";
  return { isError: true, content: [{ type: "text", text: `Not saved: ${res.error}${missing}${later}` }] };
}

async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof AssistantError ? err.message : "Something went wrong on the server. Try again in a moment.";
    if (!(err instanceof AssistantError)) console.error("[mcp]", err);
    return { isError: true, content: [{ type: "text", text: msg }] };
  }
}

export function createMcpServer(userId: string) {
  const server = new McpServer(
    { name: "courseforge", title: `${publicEnv.appName} course builder`, version: "1.1.0" },
    { instructions: INSTRUCTIONS },
  );

  /* ------------------------------ discovery ------------------------------ */

  server.registerTool(
    "list_courses",
    {
      title: "List my courses",
      description: "List the user's courses, including ones your assistant is still generating (status 'processing').",
      inputSchema: { status: z.enum(["all", "generating", "ready"]).default("all").optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ status }) =>
      guard(async () => {
        const db = createAdminClient();
        let q = db
          .from("courses")
          .select("id, title, status, generation_engine, created_at, original_video_title")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        if (status === "generating") q = q.eq("status", "processing");
        if (status === "ready") q = q.in("status", ["ready", "needs_review"]);
        const { data } = await q;
        if (!data?.length) {
          return {
            content: [
              {
                type: "text",
                text: "No courses yet. Create one with create_course (YouTube), create_course_from_prompt, create_course_from_article, create_course_from_document or create_course_from_media.",
              },
            ],
          };
        }
        const lines = data.map(
          (c) =>
            `- ${c.title} — id ${c.id} · ${c.status}${
              c.status === "processing"
                ? c.generation_engine === "assistant"
                  ? " (waiting for you: call get_next_step)"
                  : " (platform is generating: get_course_status)"
                : ""
            } · ${publicEnv.siteUrl}/dashboard/courses/${c.id}`,
        );
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }),
  );

  const Writer = z
    .enum(["me", "platform"])
    .default("me")
    .optional()
    .describe('"me" (default): you write the course in this chat. "platform": the platform\'s built-in AI writes it in the background.');

  /** Creates the course, then either returns the first task (writer "me") or starts the background engine. */
  const start = async (input: CreateCourseInput, writer: "me" | "platform" | undefined): Promise<CallToolResult> => {
    const platform = writer === "platform";
    if (platform && !aiConfigured()) {
      return {
        isError: true,
        content: [{ type: "text", text: 'The platform\'s built-in AI isn\'t configured on this server. Use writer "me" so you write the course yourself.' }],
      };
    }
    const res = await createCourseForUser(userId, { ...input, engine: platform ? "server" : "assistant" });
    if (!res.ok) return { isError: true, content: [{ type: "text", text: res.error }] };
    const url = `${publicEnv.siteUrl}/dashboard/courses/${res.data.courseId}`;
    if (platform) {
      after(() => kickJob(res.data.jobId));
      return {
        content: [
          {
            type: "text",
            text: `Course created (id ${res.data.courseId}). The platform is now generating it in the background — this usually takes several minutes. Track it at ${url}, or call get_course_status with course_id="${res.data.courseId}". Tell the user it's underway and share the link.`,
          },
        ],
      };
    }
    const ctx = await loadAssistantJob(userId, res.data.courseId);
    return render(await nextStep(ctx), `Course created (id ${res.data.courseId}). Track it at ${url}`);
  };

  server.registerTool(
    "create_course",
    {
      title: "Create a course from a YouTube video",
      description:
        "Start a new course from a YouTube URL (watch, youtu.be or Shorts). The server fetches the video details and transcript. If the user pasted the video's transcript, pass it as transcript_text instead.",
      inputSchema: {
        youtube_url: z.string().describe("YouTube video URL"),
        transcript: z
          .enum(["captions", "ai_transcription"])
          .default("captions")
          .optional()
          .describe("Use the video's captions (default) or transcribe its audio when it has no captions. Ignored when transcript_text is given."),
        transcript_text: z
          .string()
          .max(5_000_000)
          .optional()
          .describe("The full transcript, if the user provided it (.vtt/.srt content, [mm:ss] lines or plain text)"),
        language: z.string().max(5).optional().describe("Preferred transcript language code, e.g. en"),
        writer: Writer,
      },
    },
    async ({ youtube_url, transcript, transcript_text, language, writer }) =>
      guard(async () => {
        const manual = Boolean(transcript_text?.trim());
        if (!manual && !transcriptProviderConfigured()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Automatic transcripts aren't configured on this server. Ask the user to paste the video's transcript (YouTube → ⋯ → Show transcript) and call create_course again with transcript_text.",
              },
            ],
          };
        }
        return start(
          {
            sourceType: "youtube",
            url: youtube_url,
            transcriptSource: manual ? "manual" : (transcript ?? "captions"),
            transcriptText: manual ? transcript_text : undefined,
            lang: language,
          },
          writer,
        );
      }),
  );

  server.registerTool(
    "create_course_from_prompt",
    {
      title: "Create a course from a description",
      description:
        "Create a course with no source material — just a description of what it should teach. A syllabus is planned from the brief, then every lesson, quiz and the final assessment are written. Put everything the user said about scope, audience, must-cover topics, examples and tone into prompt.",
      inputSchema: {
        prompt: z.string().min(20).max(8000).describe("The course brief: topic, goals, audience, must-cover items, exclusions, tone"),
        title: z.string().max(200).optional().describe("Working title, if the user gave one"),
        level: z.enum(["beginner", "intermediate", "advanced", "any"]).default("any").optional(),
        depth: z
          .enum(["short", "standard", "comprehensive"])
          .default("standard")
          .optional()
          .describe("short ≈ mini-course, standard ≈ complete course, comprehensive ≈ in-depth"),
        language: z.string().max(40).optional().describe("Language to write the course in, e.g. English, French, Hausa"),
        writer: Writer,
      },
    },
    async ({ prompt, title, level, depth, language, writer }) =>
      guard(async () =>
        start({ sourceType: "prompt", prompt, title, level: level ?? "any", depth: depth ?? "standard", lang: language }, writer),
      ),
  );

  server.registerTool(
    "create_course_from_article",
    {
      title: "Create a course from an article",
      description: "Create a course from a public web article or blog post. The server reads the main article text (pages behind a login or paywall can't be read).",
      inputSchema: {
        url: z.string().describe("Article URL (http/https)"),
        writer: Writer,
      },
    },
    async ({ url, writer }) => guard(async () => start({ sourceType: "article", url }, writer)),
  );

  server.registerTool(
    "create_course_from_document",
    {
      title: "Create a course from a document",
      description:
        "Create a course from a PDF, Word (.docx), text or Markdown document. Give EITHER document_url (a public link to the file) OR text (the document's complete text — use this when the user attached the file in this chat: read it and pass all of it, unabridged, keeping headings).",
      inputSchema: {
        document_url: z.string().max(2000).optional().describe("Public link to a PDF, DOCX, TXT or MD file"),
        text: z.string().max(1_500_000).optional().describe("The document's complete text, if you have the file contents"),
        file_name: z.string().max(200).optional().describe("Original file name, e.g. handbook.pdf"),
        title: z.string().max(200).optional(),
        writer: Writer,
      },
    },
    async ({ document_url, text, file_name, title, writer }) =>
      guard(async () => {
        if (!document_url?.trim() && !text?.trim()) {
          return { isError: true, content: [{ type: "text", text: "Provide document_url or the document's text." }] };
        }
        return start(
          {
            sourceType: "document",
            documentUrl: document_url?.trim() || undefined,
            documentText: document_url?.trim() ? undefined : text,
            documentName: file_name,
            title,
          },
          writer,
        );
      }),
  );

  server.registerTool(
    "create_course_from_media",
    {
      title: "Create a course from an audio or video file",
      description:
        "Create a course from a recording (lecture, podcast, webinar…) at a public direct link to an audio or video file. The recording is transcribed in full first. For YouTube links use create_course instead.",
      inputSchema: {
        media_url: z.string().max(2000).describe("Public, direct link to the audio/video file (mp4, mp3, m4a, wav, …)"),
        title: z.string().max(200).optional(),
        language: z.string().max(5).optional().describe("Spoken language code, e.g. en"),
        writer: Writer,
      },
    },
    async ({ media_url, title, language, writer }) =>
      guard(async () => {
        if (/(^|\.)(youtube\.com|youtu\.be)$/i.test((() => { try { return new URL(media_url).hostname; } catch { return ""; } })())) {
          return { isError: true, content: [{ type: "text", text: "That's a YouTube link — use create_course instead." }] };
        }
        return start({ sourceType: "video_upload", mediaUrl: media_url, title, lang: language, transcriptSource: "media_upload" }, writer);
      }),
  );

  server.registerTool(
    "get_course_status",
    {
      title: "Check a course's status",
      description: "Shows whether a course is still generating (and how far along), ready, or failed — for courses written by you or by the platform.",
      inputSchema: { course_id: CourseId },
      annotations: { readOnlyHint: true },
    },
    async ({ course_id }) =>
      guard(async () => {
        const db = createAdminClient();
        const { data: course } = await db.from("courses").select("id, user_id, title, status, generation_engine").eq("id", course_id).maybeSingle();
        if (!course || course.user_id !== userId) return { isError: true, content: [{ type: "text", text: "Course not found in your account." }] };
        const { data: job } = await db
          .from("course_generation_jobs")
          .select("status, progress, current_stage, error_message")
          .eq("course_id", course_id)
          .in("job_type", ["generate_course", "assistant_generate"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const url = `${publicEnv.siteUrl}/dashboard/courses/${course_id}`;
        const stage = job?.current_stage && job.current_stage in STAGE_LABELS ? STAGE_LABELS[job.current_stage as StageKey] : null;
        let text: string;
        if (course.status === "ready" || course.status === "needs_review") {
          text = `✅ "${course.title}" is ready${course.status === "needs_review" ? " (some items are flagged for review)" : ""}. Open it: ${url}`;
        } else if (course.status === "failed" || job?.status === "failed") {
          text = `❌ Generation failed: ${job?.error_message ?? "unknown error"}. The user can retry from ${url}`;
        } else if (course.generation_engine === "assistant") {
          text = `"${course.title}" is waiting for you to write it (${job?.progress ?? 0}% done${stage ? ` · ${stage}` : ""}). Call get_next_step with course_id="${course_id}" to continue.`;
        } else {
          text = `⏳ "${course.title}" is being generated by the platform: ${job?.progress ?? 0}%${stage ? ` · ${stage}` : ""}. Check again in a minute or two. ${url}`;
        }
        return { content: [{ type: "text", text }] };
      }),
  );

  server.registerTool(
    "get_next_step",
    {
      title: "Get the next task for a course",
      description: "Returns the next task to do for a course being generated by you (use this to resume in a new chat).",
      inputSchema: { course_id: CourseId },
    },
    async ({ course_id }) => guard(async () => render(await nextStep(await loadAssistantJob(userId, course_id)))),
  );

  /* ------------------------------- submits ------------------------------- */

  server.registerTool(
    "submit_chunk_analysis",
    {
      title: "Submit transcript window analysis",
      description: "Save the teaching points you extracted from one transcript window.",
      inputSchema: { course_id: CourseId, chunk_index: z.number().int().min(0), analysis: ChunkAnalysis },
    },
    async ({ course_id, chunk_index, analysis }) =>
      guard(async () => renderSubmit(await submitters.chunk(await loadAssistantJob(userId, course_id), chunk_index, analysis))),
  );

  server.registerTool(
    "submit_frame_analysis",
    {
      title: "Submit screenshot description",
      description: "Save your description of a screenshot the user uploaded.",
      inputSchema: { course_id: CourseId, frame_id: z.guid(), analysis: FrameAnalysis },
    },
    async ({ course_id, frame_id, analysis }) =>
      guard(async () => renderSubmit(await submitters.frame(await loadAssistantJob(userId, course_id), frame_id, analysis))),
  );

  server.registerTool(
    "submit_course_overview",
    {
      title: "Submit course overview",
      description: "Save the course title, description, audience, prerequisites and learning objectives.",
      inputSchema: { course_id: CourseId, overview: CourseOverview },
    },
    async ({ course_id, overview }) =>
      guard(async () => renderSubmit(await submitters.overview(await loadAssistantJob(userId, course_id), overview))),
  );

  server.registerTool(
    "submit_curriculum",
    {
      title: "Submit curriculum",
      description: "Save modules and lessons. Every teaching point id must be assigned to a lesson.",
      inputSchema: { course_id: CourseId, curriculum: Curriculum },
    },
    async ({ course_id, curriculum }) =>
      guard(async () => renderSubmit(await submitters.curriculum(await loadAssistantJob(userId, course_id), curriculum))),
  );

  server.registerTool(
    "submit_lesson",
    {
      title: "Submit lesson",
      description: "Save a complete lesson. It must teach every assigned teaching point.",
      inputSchema: { course_id: CourseId, lesson_id: z.guid(), lesson: LessonContent },
    },
    async ({ course_id, lesson_id, lesson }) =>
      guard(async () => renderSubmit(await submitters.lesson(await loadAssistantJob(userId, course_id), lesson_id, lesson))),
  );

  server.registerTool(
    "submit_illustrations",
    {
      title: "Submit lesson illustrations",
      description: "Save diagrams and visual explanations for a lesson.",
      inputSchema: { course_id: CourseId, lesson_id: z.guid(), illustrations: IllustrationSet },
    },
    async ({ course_id, lesson_id, illustrations }) =>
      guard(async () => renderSubmit(await submitters.illustrations(await loadAssistantJob(userId, course_id), lesson_id, illustrations))),
  );

  server.registerTool(
    "submit_quiz",
    {
      title: "Submit quiz",
      description: "Save a module quiz or the final assessment.",
      inputSchema: {
        course_id: CourseId,
        quiz_key: z.string().describe('The quiz_key from the task: a module id, or "final"'),
        quiz: QuizSpec,
      },
    },
    async ({ course_id, quiz_key, quiz }) =>
      guard(async () => renderSubmit(await submitters.quiz(await loadAssistantJob(userId, course_id), quiz_key, quiz))),
  );

  server.registerTool(
    "submit_quality_review",
    {
      title: "Submit quality review",
      description: "Save your review of the finished course. The server then finalizes and publishes it to the user's dashboard.",
      inputSchema: { course_id: CourseId, review: QualityReview },
    },
    async ({ course_id, review }) =>
      guard(async () => renderSubmit(await submitters.quality(await loadAssistantJob(userId, course_id), review))),
  );

  /* ------------------------------- prompt -------------------------------- */

  const promptMsg = (text: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text } }] });
  const keepGoing = "then keep completing each task it gives you until the course is done.";

  server.registerPrompt(
    "create_course",
    {
      title: "Course from a YouTube video",
      description: "Generate a complete course from a YouTube video using your own AI.",
      argsSchema: { youtube_url: z.string().describe("YouTube video URL") },
    },
    ({ youtube_url }) => promptMsg(`Create a complete ${publicEnv.appName} course from this video: ${youtube_url}\n\nUse the create_course tool, ${keepGoing}`),
  );

  server.registerPrompt(
    "course_from_prompt",
    {
      title: "Course from a description",
      description: "Describe a course and have it written for you.",
      argsSchema: { topic: z.string().describe("What the course should teach, and for whom") },
    },
    ({ topic }) =>
      promptMsg(
        `Create a complete ${publicEnv.appName} course from this brief:\n\n${topic}\n\nAsk me at most one clarifying question if something essential is missing, then use create_course_from_prompt, ${keepGoing}`,
      ),
  );

  server.registerPrompt(
    "course_from_article",
    {
      title: "Course from an article",
      description: "Turn a web article or blog post into a course.",
      argsSchema: { url: z.string().describe("Article URL") },
    },
    ({ url }) => promptMsg(`Create a complete ${publicEnv.appName} course from this article: ${url}\n\nUse create_course_from_article, ${keepGoing}`),
  );

  server.registerPrompt(
    "course_from_document",
    {
      title: "Course from a document",
      description: "Turn a PDF, Word or text document into a course (attach it or give a link).",
      argsSchema: { document_url: z.string().optional().describe("Public link to the document (leave empty if you attach the file)") },
    },
    ({ document_url }) =>
      promptMsg(
        document_url
          ? `Create a complete ${publicEnv.appName} course from this document: ${document_url}\n\nUse create_course_from_document with document_url, ${keepGoing}`
          : `Create a complete ${publicEnv.appName} course from the document I've attached. Read the whole file and pass its complete text to create_course_from_document, ${keepGoing}`,
      ),
  );

  server.registerPrompt(
    "course_from_media",
    {
      title: "Course from a recording",
      description: "Turn an audio or video recording (public link) into a course.",
      argsSchema: { media_url: z.string().describe("Public direct link to the audio/video file") },
    },
    ({ media_url }) => promptMsg(`Create a complete ${publicEnv.appName} course from this recording: ${media_url}\n\nUse create_course_from_media, ${keepGoing}`),
  );

  return server;
}
