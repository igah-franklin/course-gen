import "server-only";
import { createClient } from "@/lib/supabase/server";

/* All reads here use the user-scoped client, so Row Level Security applies. */

export type CourseCard = {
  id: string;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  originalVideoTitle: string | null;
  channelName: string | null;
  status: string;
  isOwner: boolean;
  isPublic: boolean;
  totalLessons: number;
  completedLessons: number;
  progress: number;
  lastAccessedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  difficulty: string | null;
  estimatedDuration: number | null;
};

type CourseRow = {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  thumbnail_url: string | null;
  original_video_title: string | null;
  channel_name: string | null;
  status: string;
  is_public: boolean;
  created_at: string;
  difficulty: string | null;
  estimated_duration: number | null;
};

const COURSE_COLS =
  "id, user_id, title, subtitle, thumbnail_url, original_video_title, channel_name, status, is_public, created_at, difficulty, estimated_duration";

async function decorate(userId: string, courses: CourseRow[]): Promise<CourseCard[]> {
  if (!courses.length) return [];
  const supabase = await createClient();
  const ids = courses.map((c) => c.id);
  const [lessons, progress, enrollments] = await Promise.all([
    supabase.from("lessons").select("course_id, is_required").in("course_id", ids),
    supabase.from("lesson_progress").select("course_id, completed").eq("user_id", userId).in("course_id", ids),
    supabase
      .from("course_enrollments")
      .select("course_id, last_accessed_at, completed_at")
      .eq("user_id", userId)
      .in("course_id", ids),
  ]);
  return courses.map((c) => {
    const total = (lessons.data ?? []).filter((l) => l.course_id === c.id && l.is_required).length;
    const done = (progress.data ?? []).filter((p) => p.course_id === c.id && p.completed).length;
    const enr = (enrollments.data ?? []).find((e) => e.course_id === c.id);
    return {
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      thumbnailUrl: c.thumbnail_url,
      originalVideoTitle: c.original_video_title,
      channelName: c.channel_name,
      status: c.status,
      isOwner: c.user_id === userId,
      isPublic: c.is_public,
      totalLessons: total,
      completedLessons: Math.min(done, total),
      progress: total ? Math.round((Math.min(done, total) / total) * 100) : 0,
      lastAccessedAt: enr?.last_accessed_at ?? null,
      completedAt: enr?.completed_at ?? null,
      createdAt: c.created_at,
      difficulty: c.difficulty,
      estimatedDuration: c.estimated_duration,
    };
  });
}

/** Courses the user owns plus public courses they enrolled in. */
export async function getMyCourses(
  userId: string,
  opts: { q?: string; filter?: "all" | "in_progress" | "completed" | "not_started" | "processing"; page?: number; pageSize?: number } = {},
) {
  const supabase = await createClient();
  const pageSize = opts.pageSize ?? 12;
  const page = Math.max(1, opts.page ?? 1);

  const { data: enrolled } = await supabase.from("course_enrollments").select("course_id").eq("user_id", userId);
  const enrolledIds = (enrolled ?? []).map((e) => e.course_id as string);

  let query = supabase.from("courses").select(COURSE_COLS).order("created_at", { ascending: false });
  query = enrolledIds.length
    ? query.or(`user_id.eq.${userId},id.in.(${enrolledIds.join(",")})`)
    : query.eq("user_id", userId);
  if (opts.q) query = query.ilike("title", `%${opts.q.replace(/[%_,()]/g, " ").trim()}%`);
  if (opts.filter === "processing") query = query.in("status", ["processing", "draft", "failed"]);

  const { data, error } = await query.limit(500);
  if (error) throw error;
  let cards = await decorate(userId, (data ?? []) as CourseRow[]);
  if (opts.filter === "completed") cards = cards.filter((c) => c.totalLessons > 0 && (c.completedAt || c.progress === 100));
  if (opts.filter === "in_progress") cards = cards.filter((c) => c.progress > 0 && c.progress < 100);
  if (opts.filter === "not_started")
    cards = cards.filter((c) => c.progress === 0 && ["ready", "needs_review"].includes(c.status));

  const total = cards.length;
  return { courses: cards.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export async function getDashboardData(userId: string) {
  const supabase = await createClient();
  const { courses } = await getMyCourses(userId, { pageSize: 500 });
  const since = new Date(Date.now() - 89 * 86400_000).toISOString().slice(0, 10);
  const [activity, certificates, attempts, totalTime] = await Promise.all([
    supabase
      .from("learning_activity")
      .select("activity_date, seconds, lessons_completed")
      .eq("user_id", userId)
      .gte("activity_date", since)
      .order("activity_date"),
    supabase
      .from("certificates")
      .select("id, course_title, issued_at, certificate_number")
      .eq("user_id", userId)
      .order("issued_at", { ascending: false })
      .limit(5),
    supabase
      .from("quiz_attempts")
      .select("id, score, passed, completed_at, quizzes(title, kind, course_id)")
      .eq("user_id", userId)
      .eq("passed", true)
      .order("completed_at", { ascending: false })
      .limit(5),
    supabase.from("lesson_progress").select("time_spent_seconds").eq("user_id", userId),
  ]);

  const learningSeconds = (totalTime.data ?? []).reduce((s, r) => s + (r.time_spent_seconds ?? 0), 0);
  const completed = courses.filter((c) => c.totalLessons > 0 && (c.completedAt || c.progress === 100));
  const inProgress = courses.filter((c) => c.progress > 0 && c.progress < 100);
  const continueLearning = [...inProgress]
    .sort((a, b) => (b.lastAccessedAt ?? "").localeCompare(a.lastAccessedAt ?? ""))
    .slice(0, 6);
  const processing = courses.filter((c) => c.isOwner && ["processing", "draft"].includes(c.status));

  return {
    stats: {
      totalCourses: courses.length,
      completed: completed.length,
      inProgress: inProgress.length,
      learningHours: Math.round((learningSeconds / 3600) * 10) / 10,
    },
    continueLearning,
    processing,
    activity: (activity.data ?? []).map((a) => ({
      date: a.activity_date as string,
      minutes: Math.round((a.seconds ?? 0) / 60),
      lessons: a.lessons_completed ?? 0,
    })),
    certificates: certificates.data ?? [],
    passedQuizzes: (attempts.data ?? []) as unknown as Array<{
      id: string;
      score: number;
      completed_at: string;
      quizzes: { title: string; kind: string; course_id: string } | null;
    }>,
    recentlyCompleted: completed.slice(0, 3),
  };
}

export type CourseOutline = Awaited<ReturnType<typeof getCourseOutline>>;

/** Full course outline with this user's progress (null if not visible). */
export async function getCourseOutline(courseId: string, userId: string) {
  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
  if (!course) return null;
  const [modules, lessons, progress, enrollment, quizzes, bookmarks, latestJob, certificate] = await Promise.all([
    supabase.from("course_modules").select("id, title, description, position").eq("course_id", courseId).order("position"),
    supabase
      .from("lessons")
      .select("id, module_id, title, description, position, estimated_reading_time, original_timestamp_start, original_timestamp_end, generation_status, is_required, quality_flags")
      .eq("course_id", courseId)
      .order("position"),
    supabase
      .from("lesson_progress")
      .select("lesson_id, completed, last_read_position, completed_at, updated_at")
      .eq("user_id", userId)
      .eq("course_id", courseId),
    supabase.from("course_enrollments").select("*").eq("user_id", userId).eq("course_id", courseId).maybeSingle(),
    supabase.from("quizzes").select("id, module_id, kind, title, passing_score").eq("course_id", courseId),
    supabase.from("bookmarks").select("lesson_id").eq("user_id", userId).eq("course_id", courseId),
    supabase
      .from("course_generation_jobs")
      .select("id, status, job_type, progress, current_stage, error_message, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("certificates").select("id, certificate_number, verification_token, issued_at").eq("user_id", userId).eq("course_id", courseId).maybeSingle(),
  ]);

  const quizIds = (quizzes.data ?? []).map((q) => q.id);
  const { data: attempts } = quizIds.length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, score, passed, completed_at")
        .eq("user_id", userId)
        .in("quiz_id", quizIds)
        .order("completed_at", { ascending: false })
    : { data: [] as { quiz_id: string; score: number; passed: boolean; completed_at: string }[] };

  const progressMap = new Map((progress.data ?? []).map((p) => [p.lesson_id as string, p]));
  const bookmarked = new Set((bookmarks.data ?? []).map((b) => b.lesson_id as string));
  const quizBest = new Map<string, { best: number; passed: boolean; attempts: number }>();
  for (const a of attempts ?? []) {
    const cur = quizBest.get(a.quiz_id) ?? { best: 0, passed: false, attempts: 0 };
    quizBest.set(a.quiz_id, {
      best: Math.max(cur.best, Number(a.score)),
      passed: cur.passed || a.passed,
      attempts: cur.attempts + 1,
    });
  }

  const mods = (modules.data ?? []).map((m) => {
    const ls = (lessons.data ?? [])
      .filter((l) => l.module_id === m.id)
      .map((l) => ({
        ...l,
        completed: Boolean(progressMap.get(l.id)?.completed),
        readPosition: Number(progressMap.get(l.id)?.last_read_position ?? 0),
        bookmarked: bookmarked.has(l.id),
      }));
    const quiz = (quizzes.data ?? []).find((q) => q.module_id === m.id) ?? null;
    return {
      ...m,
      lessons: ls,
      completed: ls.filter((l) => l.is_required).every((l) => l.completed),
      quiz: quiz ? { ...quiz, ...(quizBest.get(quiz.id) ?? { best: 0, passed: false, attempts: 0 }) } : null,
    };
  });
  const flat = mods.flatMap((m) => m.lessons);
  const required = flat.filter((l) => l.is_required);
  const completedCount = required.filter((l) => l.completed).length;
  const finalQuiz = (quizzes.data ?? []).find((q) => q.kind === "final") ?? null;

  return {
    course,
    isOwner: course.user_id === userId,
    modules: mods,
    lessons: flat,
    totalLessons: required.length,
    completedLessons: completedCount,
    progress: required.length ? Math.round((completedCount / required.length) * 100) : 0,
    enrollment: enrollment.data,
    finalQuiz: finalQuiz ? { ...finalQuiz, ...(quizBest.get(finalQuiz.id) ?? { best: 0, passed: false, attempts: 0 }) } : null,
    latestJob: latestJob.data,
    certificate: certificate.data,
  };
}
