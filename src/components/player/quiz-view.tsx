"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, ClipboardCheck, Loader2, RotateCcw, Trophy, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar } from "@/components/shared/ui-bits";
import { submitQuizAction, type QuizResult } from "@/lib/actions/learning";
import { cn } from "@/lib/utils";

export type QuizQuestion = {
  id: string;
  question: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "practical";
  options: string[];
};

const TYPE_LABEL = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  short_answer: "Short answer",
  practical: "Practical exercise",
};

export function QuizView({
  quiz,
  questions,
  attempts,
  nextHref,
  courseId,
}: {
  quiz: { id: string; title: string; description: string | null; passing_score: number; kind: string };
  questions: QuizQuestion[];
  attempts: { score: number; passed: boolean; completed_at: string }[];
  nextHref: string | null;
  courseId: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [pending, start] = useTransition();
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim()).length;
  const best = attempts.reduce((m, a) => Math.max(m, Number(a.score)), 0);

  const submit = () => {
    if (answered < questions.length) {
      toast.error(`Answer all questions first (${questions.length - answered} left).`);
      return;
    }
    start(async () => {
      const r = await submitQuizAction(quiz.id, answers);
      if (!r.ok) return void toast.error(r.error);
      setResult(r.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (r.data.completion?.eligible && r.data.isFinal && r.data.passed) {
        setTimeout(() => router.push(`/dashboard/courses/${courseId}/learn?complete=1`), 1800);
      }
    });
  };

  const fb = (id: string) => result?.feedback.find((f) => f.questionId === id);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <ClipboardCheck className="size-4" /> {quiz.kind === "final" ? "Final assessment" : "Module quiz"}
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{quiz.title}</h1>
      {quiz.description && <p className="mt-2 text-muted-foreground">{quiz.description}</p>}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{questions.length} questions</span>
        <span>Pass mark {quiz.passing_score}%</span>
        {attempts.length > 0 && (
          <span>
            {attempts.length} attempt{attempts.length === 1 ? "" : "s"} · best {Math.round(best)}%
          </span>
        )}
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mt-8 rounded-2xl border p-6",
            result.passed ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5",
          )}
        >
          <div className="flex items-center gap-4">
            {result.passed ? <Trophy className="size-10 text-success" /> : <RotateCcw className="size-10 text-warning" />}
            <div className="flex-1">
              <p className="text-lg font-semibold">{result.passed ? "You passed!" : "Not quite — review and try again"}</p>
              <p className="text-sm text-muted-foreground">
                You scored <span className="font-semibold text-foreground">{Math.round(result.score)}%</span> (pass mark {result.passingScore}%).
                {result.completion && !result.completion.eligible && result.completion.missing.length > 0 && (
                  <> Remaining for your certificate: {result.completion.missing.join("; ")}.</>
                )}
              </p>
            </div>
          </div>
          <ProgressBar value={result.score} className="mt-4" />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setAnswers({});
                router.refresh();
              }}
            >
              <RotateCcw /> Retake
            </Button>
            {result.passed && result.completion?.eligible && (
              <Link href={`/dashboard/courses/${courseId}/learn?complete=1`} className={buttonVariants()}>
                <Trophy /> Claim your certificate
              </Link>
            )}
            {nextHref && (
              <Link href={nextHref} className={buttonVariants({ variant: result.passed ? "default" : "ghost" })}>
                Continue <ChevronRight />
              </Link>
            )}
          </div>
        </motion.div>
      )}

      <ol className="mt-8 space-y-5">
        {questions.map((q, i) => {
          const f = fb(q.id);
          return (
            <li key={q.id} className={cn("rounded-2xl border bg-card p-5 shadow-xs", f && (f.correct ? "border-success/40" : "border-destructive/30"))}>
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{TYPE_LABEL[q.question_type]}</p>
                  <p className="mt-1 font-medium leading-6">{q.question}</p>

                  {q.options.length > 0 ? (
                    <div className="mt-4 grid gap-2" role="radiogroup">
                      {q.options.map((opt) => {
                        const selected = answers[q.id] === opt;
                        const isCorrect = f && opt === f.correctAnswer;
                        const isWrongPick = f && selected && !f.correct;
                        return (
                          <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={Boolean(result)}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all",
                              !result && (selected ? "border-primary bg-accent/60 ring-1 ring-primary" : "hover:border-primary/40 hover:bg-muted/40"),
                              isCorrect && "border-success bg-success/10",
                              isWrongPick && "border-destructive bg-destructive/5",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                selected && !result && "border-primary bg-primary",
                              )}
                            >
                              {selected && !result && <span className="size-1.5 rounded-full bg-white" />}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && <CheckCircle2 className="size-4 text-success" />}
                            {isWrongPick && <XCircle className="size-4 text-destructive" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Textarea
                      className="mt-4 text-sm"
                      rows={q.question_type === "practical" ? 6 : 3}
                      placeholder={q.question_type === "practical" ? "Describe what you did and the result you got…" : "Your answer…"}
                      value={answers[q.id] ?? ""}
                      disabled={Boolean(result)}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  )}

                  {f && (
                    <div className="mt-4 space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
                      <p className={cn("flex items-center gap-2 font-medium", f.correct ? "text-success" : "text-destructive")}>
                        {f.correct ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                        {f.correct ? "Correct" : "Incorrect"}
                        {q.options.length === 0 && ` · ${Math.round(f.score * 100)}%`}
                      </p>
                      {f.feedback && <p>{f.feedback}</p>}
                      {!f.correct && q.options.length === 0 && (
                        <p>
                          <span className="font-medium">Model answer: </span>
                          {f.correctAnswer}
                        </p>
                      )}
                      {f.explanation && <p className="text-muted-foreground">{f.explanation}</p>}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {!result && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              {answered}/{questions.length} answered
            </span>
            <Button size="lg" className="h-10 px-6" onClick={submit} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Submit answers
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
