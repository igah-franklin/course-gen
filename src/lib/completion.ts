import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";

export type CompletionStatus = {
  requiredLessons: number;
  completedLessons: number;
  lessonsDone: boolean;
  finalRequired: boolean;
  finalQuizId: string | null;
  finalPassed: boolean;
  eligible: boolean;
  missing: string[];
};

/**
 * Completion rules: every required lesson complete (which completes every
 * module), plus the final assessment passed when the course requires it.
 * Course-level settings override platform defaults.
 */
export async function getCompletionStatus(userId: string, courseId: string): Promise<CompletionStatus> {
  const db = createAdminClient();
  const [{ data: course }, { data: lessons }, { data: progress }, { data: finalQuiz }, platform] = await Promise.all([
    db.from("courses").select("completion_settings, status").eq("id", courseId).single(),
    db.from("lessons").select("id").eq("course_id", courseId).eq("is_required", true),
    db.from("lesson_progress").select("lesson_id").eq("course_id", courseId).eq("user_id", userId).eq("completed", true),
    db.from("quizzes").select("id").eq("course_id", courseId).eq("kind", "final").maybeSingle(),
    getSetting("completion"),
  ]);
  const required = new Set((lessons ?? []).map((l) => l.id));
  const completed = (progress ?? []).filter((p) => required.has(p.lesson_id)).length;
  const settings = (course?.completion_settings ?? {}) as { require_final_assessment?: boolean };
  const finalRequired = Boolean(finalQuiz) && (settings.require_final_assessment ?? platform.require_final_assessment);

  let finalPassed = false;
  if (finalQuiz) {
    const { count } = await db
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("quiz_id", finalQuiz.id)
      .eq("passed", true);
    finalPassed = (count ?? 0) > 0;
  }

  const lessonsDone = required.size > 0 && completed >= required.size;
  const missing: string[] = [];
  if (!lessonsDone) missing.push(`Complete ${required.size - completed} more lesson${required.size - completed === 1 ? "" : "s"}`);
  if (finalRequired && !finalPassed) missing.push("Pass the final assessment");
  return {
    requiredLessons: required.size,
    completedLessons: completed,
    lessonsDone,
    finalRequired,
    finalQuizId: finalQuiz?.id ?? null,
    finalPassed,
    eligible: lessonsDone && (!finalRequired || finalPassed) && ["ready", "needs_review"].includes(course?.status ?? ""),
    missing,
  };
}

/** Marks the enrollment complete once requirements are met. Returns the status. */
export async function syncCourseCompletion(userId: string, courseId: string) {
  const status = await getCompletionStatus(userId, courseId);
  const db = createAdminClient();
  const base = db.from("course_enrollments");
  if (status.eligible) {
    // Keep the first completion date.
    await base
      .update({ completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .is("completed_at", null);
  } else {
    await base.update({ completed_at: null }).eq("user_id", userId).eq("course_id", courseId);
  }
  return status;
}
