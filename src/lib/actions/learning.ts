"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCourseCompletion, type CompletionStatus } from "@/lib/completion";
import { aiConfigured, getAiProvider } from "@/lib/ai/provider";
import { GradeResult } from "@/lib/ai/schemas";
import { SYSTEM_GRADER } from "@/lib/ai/prompts";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function authed() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

/** Verifies the lesson belongs to the course and the user can view it (RLS). */
async function visibleLesson(courseId: string, lessonId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("lessons").select("id, course_id").eq("id", lessonId).maybeSingle();
  if (!data || data.course_id !== courseId) throw new Error("Lesson not found");
  return supabase;
}

/* ------------------------------- visits ---------------------------------- */

export async function recordLessonVisitAction(courseId: string, lessonId: string): Promise<void> {
  const user = await authed();
  const supabase = await visibleLesson(courseId, lessonId);
  await supabase.from("course_enrollments").upsert(
    { user_id: user.id, course_id: courseId, last_lesson_id: lessonId, last_accessed_at: new Date().toISOString() },
    { onConflict: "user_id,course_id" },
  );
}

/* ------------------------------- progress -------------------------------- */

const ProgressInput = z.object({
  position: z.number().min(0).max(1),
  seconds: z.number().int().min(0).max(300),
});

/** Saves reading position and adds active reading time (bounded per call). */
export async function saveLessonProgressAction(courseId: string, lessonId: string, input: z.input<typeof ProgressInput>) {
  const user = await authed();
  const parsed = ProgressInput.safeParse(input);
  if (!parsed.success) return;
  const supabase = await visibleLesson(courseId, lessonId);
  const { data: existing } = await supabase
    .from("lesson_progress")
    .select("time_spent_seconds")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      course_id: courseId,
      last_read_position: Math.round(parsed.data.position * 1000) / 1000,
      time_spent_seconds: (existing?.time_spent_seconds ?? 0) + parsed.data.seconds,
    },
    { onConflict: "user_id,lesson_id" },
  );
  if (parsed.data.seconds > 0) await supabase.rpc("record_learning_time", { p_seconds: parsed.data.seconds });
}

export async function setLessonCompleteAction(
  courseId: string,
  lessonId: string,
  completed: boolean,
): Promise<Result<CompletionStatus>> {
  try {
    const user = await authed();
    const supabase = await visibleLesson(courseId, lessonId);
    const { data: before } = await supabase
      .from("lesson_progress")
      .select("completed")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    const { error } = await supabase.from("lesson_progress").upsert(
      {
        user_id: user.id,
        lesson_id: lessonId,
        course_id: courseId,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        ...(completed ? { last_read_position: 1 } : {}),
      },
      { onConflict: "user_id,lesson_id" },
    );
    if (error) return { ok: false, error: error.message };
    if (completed && !before?.completed) {
      await supabase.rpc("record_learning_time", { p_seconds: 0, p_lessons_completed: 1 });
    }
    await supabase.from("course_enrollments").upsert(
      { user_id: user.id, course_id: courseId, last_lesson_id: lessonId, last_accessed_at: new Date().toISOString() },
      { onConflict: "user_id,course_id" },
    );
    const status = await syncCourseCompletion(user.id, courseId);
    revalidatePath(`/dashboard/courses/${courseId}`);
    return { ok: true, data: status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/* ------------------------------ bookmarks/notes -------------------------- */

export async function toggleBookmarkAction(courseId: string, lessonId: string, bookmarked: boolean): Promise<Result<boolean>> {
  const user = await authed();
  const supabase = await visibleLesson(courseId, lessonId);
  const { error } = bookmarked
    ? await supabase
        .from("bookmarks")
        .upsert({ user_id: user.id, lesson_id: lessonId, course_id: courseId }, { onConflict: "user_id,lesson_id" })
    : await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("lesson_id", lessonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: bookmarked };
}

export async function saveNoteAction(courseId: string, lessonId: string, content: string): Promise<Result<string>> {
  const user = await authed();
  const supabase = await visibleLesson(courseId, lessonId);
  const text = content.slice(0, 50_000);
  const { error } = await supabase
    .from("learning_notes")
    .upsert({ user_id: user.id, lesson_id: lessonId, course_id: courseId, content: text }, { onConflict: "user_id,lesson_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: new Date().toISOString() };
}

/* --------------------------------- quizzes -------------------------------- */

export type QuestionFeedback = {
  questionId: string;
  correct: boolean;
  score: number;
  yourAnswer: string;
  correctAnswer: string;
  explanation: string | null;
  feedback: string | null;
};

export type QuizResult = {
  attemptId: string;
  score: number;
  passed: boolean;
  passingScore: number;
  feedback: QuestionFeedback[];
  completion: CompletionStatus | null;
  isFinal: boolean;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Grades server-side (answers never reach the client before submission). */
export async function submitQuizAction(quizId: string, answers: Record<string, string>): Promise<Result<QuizResult>> {
  const user = await authed();
  const supabase = await createClient();
  // Visibility check through RLS.
  const { data: quiz } = await supabase.from("quizzes").select("id, course_id, kind, passing_score").eq("id", quizId).maybeSingle();
  if (!quiz) return { ok: false, error: "Quiz not found." };

  const db = createAdminClient();
  const { data: questions } = await db
    .from("quiz_questions")
    .select("id, question, question_type, options, correct_answer, explanation")
    .eq("quiz_id", quizId)
    .order("position");
  if (!questions?.length) return { ok: false, error: "This quiz has no questions." };

  const feedback: QuestionFeedback[] = questions.map((q) => {
    const yourAnswer = String(answers[q.id] ?? "").slice(0, 5000);
    const objective = q.question_type === "multiple_choice" || q.question_type === "true_false";
    const correct = objective && norm(yourAnswer) === norm(q.correct_answer);
    return {
      questionId: q.id,
      correct,
      score: correct ? 1 : 0,
      yourAnswer,
      correctAnswer: q.correct_answer,
      explanation: q.explanation,
      feedback: null,
    };
  });

  // Free-text answers: AI grading against the model answer.
  const openQs = questions.filter((q) => q.question_type === "short_answer" || q.question_type === "practical");
  const answeredOpen = openQs.filter((q) => (answers[q.id] ?? "").trim().length > 0);
  if (answeredOpen.length) {
    if (aiConfigured()) {
      try {
        const ai = await getAiProvider();
        const { data } = await ai.generateStructured({
          operation: "grade_answers",
          system: SYSTEM_GRADER,
          schema: GradeResult,
          maxTokens: 8000,
          effort: "low",
          context: { userId: user.id, courseId: quiz.course_id },
          content: [
            {
              type: "text",
              text: answeredOpen
                .map(
                  (q) => `<item question_id="${q.id}">
Question: ${q.question}
Model answer / rubric: ${q.correct_answer}
Learner answer: ${answers[q.id]}
</item>`,
                )
                .join("\n"),
            },
          ],
        });
        for (const r of data.results) {
          const f = feedback.find((x) => x.questionId === r.question_id);
          if (!f) continue;
          f.score = Math.max(0, Math.min(1, r.score));
          f.correct = r.correct && f.score >= 0.6;
          f.feedback = r.feedback;
        }
      } catch (e) {
        console.error("[quiz] AI grading failed", e);
        return { ok: false, error: "We couldn't grade your written answers right now. Please try again." };
      }
    } else {
      // Fallback: keyword overlap with the model answer.
      for (const q of answeredOpen) {
        const f = feedback.find((x) => x.questionId === q.id)!;
        const words = new Set(norm(q.correct_answer).split(/\W+/).filter((w) => w.length > 3));
        const hits = norm(f.yourAnswer).split(/\W+/).filter((w) => words.has(w));
        f.score = words.size ? Math.min(1, new Set(hits).size / Math.max(3, words.size * 0.5)) : 0;
        f.correct = f.score >= 0.6;
        f.feedback = "Graded by keyword match against the model answer.";
      }
    }
  }

  const score = Math.round((feedback.reduce((s, f) => s + f.score, 0) / feedback.length) * 1000) / 10;
  const passed = score >= quiz.passing_score;
  const { data: attempt, error } = await db
    .from("quiz_attempts")
    .insert({ user_id: user.id, quiz_id: quizId, score, passed, answers: feedback })
    .select("id")
    .single();
  if (error || !attempt) return { ok: false, error: "Could not save your attempt." };

  const completion = quiz.kind === "final" || passed ? await syncCourseCompletion(user.id, quiz.course_id) : null;
  revalidatePath(`/dashboard/courses/${quiz.course_id}`);
  return {
    ok: true,
    data: {
      attemptId: attempt.id,
      score,
      passed,
      passingScore: quiz.passing_score,
      feedback,
      completion,
      isFinal: quiz.kind === "final",
    },
  };
}
