import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCourseOutline } from "@/lib/data/learner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompletionStatus } from "@/lib/completion";
import { getCachedCommunityLinks } from "@/lib/settings-cached";
import { PlayerShell } from "@/components/player/player-shell";
import { hrefFor, sequence, type PlayerLocation, type PlayerOutline } from "@/components/player/player-nav";
import { LessonView } from "@/components/player/lesson-view";
import { BookmarkButton, LessonControls, NotesButton } from "@/components/player/lesson-controls";
import { QuizView, type QuizQuestion } from "@/components/player/quiz-view";
import { CompletionScreen } from "@/components/player/completion-screen";
import { AuthorTools } from "@/components/player/author-tools";
import type { IllustrationRow } from "@/components/player/illustration-card";
import { userHasCourseAccess } from "@/lib/data/marketplace";
import { sourceTypeOf } from "@/lib/sources/labels";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage(props: PageProps<"/dashboard/courses/[courseId]/learn">) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      }
    >
      <Learn {...props} />
    </Suspense>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function Learn({ params, searchParams }: PageProps<"/dashboard/courses/[courseId]/learn">) {
  const { courseId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/dashboard/courses/${courseId}/learn`);
  const outline = await getCourseOutline(courseId, user.id);
  if (!outline) notFound();
  if (!["ready", "needs_review"].includes(outline.course.status)) redirect(`/dashboard/courses/${courseId}`);
  // No access yet (shared course not enrolled / not purchased) → course page shows how to enroll.
  if (!(await userHasCourseAccess(user.id, courseId, outline.course.user_id, user.role === "admin"))) {
    redirect(`/dashboard/courses/${courseId}`);
  }

  const playerOutline: PlayerOutline = {
    courseId,
    courseTitle: outline.course.title,
    progress: outline.progress,
    completedLessons: outline.completedLessons,
    totalLessons: outline.totalLessons,
    modules: outline.modules.map((m) => ({
      id: m.id,
      title: m.title,
      completed: m.completed,
      lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, completed: l.completed, bookmarked: l.bookmarked })),
      quiz: m.quiz ? { id: m.quiz.id, title: m.quiz.title, passed: m.quiz.passed } : null,
    })),
    finalQuiz: outline.finalQuiz ? { id: outline.finalQuiz.id, title: outline.finalQuiz.title, passed: outline.finalQuiz.passed } : null,
  };

  const lessonParam = typeof sp.lesson === "string" ? sp.lesson : null;
  const quizParam = typeof sp.quiz === "string" ? sp.quiz : null;
  const complete = sp.complete === "1";

  // Resolve location (resume when none given).
  let current: PlayerLocation;
  if (complete) current = { kind: "complete" };
  else if (quizParam) current = { kind: "quiz", id: quizParam };
  else {
    const fallback =
      (outline.enrollment?.last_lesson_id && outline.lessons.some((l) => l.id === outline.enrollment!.last_lesson_id)
        ? outline.enrollment.last_lesson_id
        : null) ??
      outline.lessons.find((l) => !l.completed)?.id ??
      outline.lessons[0]?.id;
    const id = lessonParam && outline.lessons.some((l) => l.id === lessonParam) ? lessonParam : fallback;
    if (!id) redirect(`/dashboard/courses/${courseId}`);
    current = { kind: "lesson", id };
  }

  const seq = sequence(playerOutline);
  const idx = current.kind === "complete" ? seq.length : seq.findIndex((s) => s.kind === current.kind && "id" in current && s.id === current.id);
  const prev = idx > 0 ? seq[idx - 1] : null;
  const next = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;
  const nextLabel = next?.kind === "quiz" ? "Take Quiz" : "Next Lesson";
  const supabase = await createClient();

  /* ------------------------------ completion ------------------------------ */
  if (current.kind === "complete") {
    const [status, links] = await Promise.all([getCompletionStatus(user.id, courseId), getCachedCommunityLinks()]);
    return (
      <PlayerShell outline={playerOutline} current={current}>
        <CompletionScreen
          courseId={courseId}
          courseTitle={outline.course.title}
          eligible={status.eligible}
          missing={status.missing}
          existingCertificateId={outline.certificate?.id ?? null}
          links={links}
        />
      </PlayerShell>
    );
  }

  /* --------------------------------- quiz --------------------------------- */
  if (current.kind === "quiz") {
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, title, description, passing_score, kind")
      .eq("id", current.id)
      .eq("course_id", courseId)
      .maybeSingle();
    if (!quiz) notFound();
    // Column grants keep correct_answer/explanation out of reach of this client.
    const [{ data: qs }, { data: attempts }] = await Promise.all([
      supabase.from("quiz_questions").select("id, question, question_type, options, position").eq("quiz_id", quiz.id).order("position"),
      supabase
        .from("quiz_attempts")
        .select("score, passed, completed_at")
        .eq("quiz_id", quiz.id)
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false }),
    ]);
    const questions: QuizQuestion[] = shuffle(
      (qs ?? []).map((q) => ({
        id: q.id,
        question: q.question,
        question_type: q.question_type,
        options: q.question_type === "multiple_choice" ? shuffle((q.options as string[]) ?? []) : ((q.options as string[]) ?? []),
      })),
    );
    return (
      <PlayerShell outline={playerOutline} current={current}>
        <QuizView
          key={quiz.id}
          quiz={quiz}
          questions={questions}
          attempts={attempts ?? []}
          nextHref={next ? hrefFor(courseId, next) : `${hrefFor(courseId, { kind: "complete" })}`}
          courseId={courseId}
        />
      </PlayerShell>
    );
  }

  /* -------------------------------- lesson -------------------------------- */
  const lessonId = current.id;
  const [{ data: lesson }, { data: ills }, { data: note }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, title, description, content, original_timestamp_start, original_timestamp_end, estimated_reading_time, generation_status, quality_flags, module_id")
      .eq("id", lessonId)
      .single(),
    supabase.from("lesson_illustrations").select("*").eq("lesson_id", lessonId).order("position"),
    supabase.from("learning_notes").select("content").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!lesson) notFound();

  // Private uploads (frames/screenshots) are served via short-lived signed URLs.
  const admin = createAdminClient();
  const illustrations: IllustrationRow[] = await Promise.all(
    (ills ?? []).map(async (ill) => {
      const bucket = (ill.metadata as { bucket?: string })?.bucket;
      if (ill.storage_path && bucket === "uploads") {
        const { data } = await admin.storage.from("uploads").createSignedUrl(ill.storage_path, 60 * 60);
        return { ...ill, signed_url: data?.signedUrl ?? null } as IllustrationRow;
      }
      return ill as IllustrationRow;
    }),
  );

  const meta = outline.lessons.find((l) => l.id === lessonId)!;
  const modIndex = outline.modules.findIndex((m) => m.id === lesson.module_id);
  const mod = outline.modules[modIndex];
  const lessonIndex = mod?.lessons.findIndex((l) => l.id === lessonId) ?? 0;
  const hasTimestamps = (outline.course.coverage as { has_timestamps?: boolean })?.has_timestamps !== false;

  return (
    <PlayerShell
      outline={playerOutline}
      current={current}
      headerActions={
        <>
          {outline.isOwner && <AuthorTools courseId={courseId} lessonId={lessonId} userId={user.id} />}
          <NotesButton key={`n-${lessonId}`} courseId={courseId} lessonId={lessonId} initialNote={note?.content ?? ""} />
          <BookmarkButton key={`b-${lessonId}`} courseId={courseId} lessonId={lessonId} bookmarked={meta.bookmarked} />
        </>
      }
      footer={
        <LessonControls
          key={lessonId}
          courseId={courseId}
          lessonId={lessonId}
          completed={meta.completed}
          readPosition={meta.completed ? 0 : meta.readPosition}
          prevHref={prev ? hrefFor(courseId, prev) : null}
          nextHref={next ? hrefFor(courseId, next) : null}
          nextLabel={nextLabel}
        />
      }
    >
      <LessonView
        lesson={{
          ...lesson,
          content: (lesson.content ?? {}) as never,
          quality_flags: (lesson.quality_flags ?? []) as { severity: string; issue: string }[],
        }}
        moduleLabel={`Module ${modIndex + 1} · Lesson ${lessonIndex + 1} — ${mod?.title ?? ""}`}
        illustrations={illustrations}
        videoId={outline.course.youtube_video_id ?? null}
        hasTimestamps={hasTimestamps}
        source={{
          kind: sourceTypeOf(outline.course.source_type),
          title: outline.course.original_video_title ?? null,
          url: outline.course.source_url ?? null,
        }}
      />
    </PlayerShell>
  );
}
