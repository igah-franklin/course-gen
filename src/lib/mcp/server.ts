import "server-only";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { createCourseForUser } from "@/lib/courses/create";
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

const INSTRUCTIONS = `${publicEnv.appName} turns YouTube videos into complete courses. You (the assistant) do the writing; the server stores the course, validates every submission, and tracks progress.

Workflow:
1. create_course with the YouTube URL (or list_courses / get_next_step to continue an existing one).
2. Each result tells you the next task: read its Instructions and Input, do the work yourself, then call the named submit_* tool with exactly the requested ids.
3. Every submit_* result contains the following task. Keep going until the course is done, without asking the user for confirmation between steps unless something fails.
4. If a submission is rejected, fix exactly what the error says and resubmit the same item.
5. If the conversation gets long, tell the user they can open a new chat and say "continue my course" — progress is saved on the server.

Quality bar: be faithful to the video's transcript, cover every teaching point you are given, never invent facts presented as coming from the video, and label supplementary examples as such.`;

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
    { name: "courseforge", title: `${publicEnv.appName} course builder`, version: "1.0.0" },
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
        if (!data?.length) return { content: [{ type: "text", text: "No courses yet. Use create_course with a YouTube URL." }] };
        const lines = data.map(
          (c) =>
            `- ${c.title} — id ${c.id} · ${c.status}${c.status === "processing" && c.generation_engine === "assistant" ? " (waiting for you: call get_next_step)" : ""} · ${publicEnv.siteUrl}/dashboard/courses/${c.id}`,
        );
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }),
  );

  server.registerTool(
    "create_course",
    {
      title: "Create a course from a YouTube video",
      description:
        "Start a new course from a YouTube URL (watch, youtu.be or Shorts). The server fetches the video details and transcript, then returns the first task for you to do.",
      inputSchema: {
        youtube_url: z.string().describe("YouTube video URL"),
        transcript: z
          .enum(["captions", "ai_transcription"])
          .default("captions")
          .optional()
          .describe("Use the video's captions (default) or transcribe its audio when it has no captions"),
        language: z.string().max(5).optional().describe("Preferred transcript language code, e.g. en"),
      },
    },
    async ({ youtube_url, transcript, language }) =>
      guard(async () => {
        if (!transcriptProviderConfigured()) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Automatic transcripts aren't configured on this server. Ask the user to create the course in the web app (${publicEnv.siteUrl}/dashboard/courses/new) with an uploaded transcript and choose "Your Claude / ChatGPT"; then continue it here with get_next_step.`,
              },
            ],
          };
        }
        const res = await createCourseForUser(userId, {
          url: youtube_url,
          engine: "assistant",
          transcriptSource: transcript ?? "captions",
          lang: language,
        });
        if (!res.ok) return { isError: true, content: [{ type: "text", text: res.error }] };
        const ctx = await loadAssistantJob(userId, res.data.courseId);
        return render(await nextStep(ctx), `Course created (id ${res.data.courseId}). Track it at ${publicEnv.siteUrl}/dashboard/courses/${res.data.courseId}`);
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

  server.registerPrompt(
    "create_course",
    {
      title: "Create a course from a YouTube video",
      description: "Generate a complete course from a YouTube video using your own AI.",
      argsSchema: { youtube_url: z.string().describe("YouTube video URL") },
    },
    ({ youtube_url }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create a complete ${publicEnv.appName} course from this video: ${youtube_url}\n\nUse the create_course tool, then keep completing each task it gives you until the course is done.`,
          },
        },
      ],
    }),
  );

  return server;
}
