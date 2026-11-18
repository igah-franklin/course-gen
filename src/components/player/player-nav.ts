export type PlayerOutline = {
  courseId: string;
  courseTitle: string;
  progress: number;
  completedLessons: number;
  totalLessons: number;
  modules: {
    id: string;
    title: string;
    completed: boolean;
    lessons: { id: string; title: string; completed: boolean; bookmarked: boolean }[];
    quiz: { id: string; title: string; passed: boolean } | null;
  }[];
  finalQuiz: { id: string; title: string; passed: boolean } | null;
};

export type PlayerLocation = { kind: "lesson"; id: string } | { kind: "quiz"; id: string } | { kind: "complete" };

export function hrefFor(courseId: string, loc: PlayerLocation) {
  const base = `/dashboard/courses/${courseId}/learn`;
  if (loc.kind === "lesson") return `${base}?lesson=${loc.id}`;
  if (loc.kind === "quiz") return `${base}?quiz=${loc.id}`;
  return `${base}?complete=1`;
}

/** Linear sequence: lessons, each module's quiz after its lessons, then the final assessment. */
export function sequence(outline: PlayerOutline): PlayerLocation[] {
  const seq: PlayerLocation[] = [];
  for (const m of outline.modules) {
    for (const l of m.lessons) seq.push({ kind: "lesson", id: l.id });
    if (m.quiz) seq.push({ kind: "quiz", id: m.quiz.id });
  }
  if (outline.finalQuiz) seq.push({ kind: "quiz", id: outline.finalQuiz.id });
  return seq;
}
